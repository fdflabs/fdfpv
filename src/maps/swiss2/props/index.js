/*
 * props/index.js: the things on swiss2's floor that give it its scale.
 *
 *   buildProps(ctx) -> { group, update(camera), dispose(), stats }
 *
 * A photograph of Lauterbrunnen's floor is dotted with small timber
 * barns, fenced, and in summer laid with bales where the hay has been
 * cut; the banks of its stream are gravel, and its lake has a reed bank.
 * Round 2's floor had none of it, so a field a hundred metres across and
 * one ten metres across looked the same. This draws:
 *
 *   HAY HUTS, the Stadel, alone in the fields and up the meadows on the
 *   walls between the stands of forest: a box of sun blackened larch on
 *   a stone plinth under a shingle or tin roof with its ridge down the
 *   slope. On a field's edge, as they are (a hut is built where it
 *   takes no hay from the field).
 *
 *   FENCES round the pastures the ground's paint lays (vegetation/
 *   zones.js reads its parcels): posts and two rails, gapped where the
 *   stream, a road or the village cross them.
 *
 *   BALES in the fields the paint shows freshly cut, wrapped white, in a
 *   loose line where the baler dropped them.
 *
 *   GRAVEL BARS on the insides of the stream's bends (water/stream.js).
 *
 *   A REED BANK along the lake's north shore either side of the jetty,
 *   and in its sheltered corners, dense where nature.js's reeds are
 *   scattered clumps.
 *
 *   THE ROADSIDE: a delineator post either side of the valley road
 *   every fifty metres.
 *
 *   Two places set by hand, as a farm's things are, where the lake-shore
 *   and farm-low views stand: at the road's end by the lake a fence
 *   along the verge with a gate, a stack of logs under a lean of tin, a
 *   hay hut, a yellow hiking signpost and a boat shed in the reeds; on
 *   the floor west of the strip a pasture fence with a gate and a stack
 *   of logs. Their fence lines are handed to the grass (`margins`),
 *   which leaves them long.
 *
 * The huts, the bales, the bars, the reeds and the roadside are one
 * static mesh (a few hundred huts and bales at a few tens of triangles
 * apiece, the reeds a blade two triangles); the fences are an instanced
 * span of two posts and two rails, refilled from the spans near the
 * camera and in its view as the trees are, since a valley of fence posts
 * is tens of thousands of triangles and a post is under a pixel past a
 * few hundred metres.
 * Two draws in all (and the same two in each shadow map), which the
 * rocks paid for (vegetation/rocks.js), with one vertex coloured
 * material (propMaterial says why). What a craft can hit has a collider,
 * within 700 m of the strip as nature.js's have: a hut its box (noted
 * as a wall, so the meadow keeps off it and the ground under it is the
 * village's), a bale a sphere, a fence span, a gate and a delineator a
 * capsule, a stack of logs a box.
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

import * as THREE from 'three';
import { noise2, smoothstep } from '../../alps/noise.js';
import {
  HALF, LAKE_Y, LAKE_N, TREE_LINE, forestDensity, valleyAxis,
} from '../../alps/terrain.js';
import {
  valleyLayout, meadowField, meadowCuts, lakeShore, jettyClear, ROAD_DX, ROAD_END, STREET_Z,
} from '../vegetation/zones.js';
import { gravelBarGeometry } from '../water/stream.js';

const COLLIDE_R = 700;
/* Fence spans are drawn this far from the camera. */
const FENCE_R = 420;
/* A fence span, post to post, in metres along the ground. */
const SPAN = 2.5;

const UP = new THREE.Vector3(0, 1, 0);

/* Colours are albedos in linear light: sun blackened larch, silvered
 * larch, shingle, stone, the wrap on a bale. */
const FENCE = [0.1, 0.086, 0.072];
const STONE = [0.16, 0.155, 0.145];
const DOOR = [0.012, 0.01, 0.009];

/*
 * Triangles in world space with flat normals and vertex colours, for the
 * one static mesh.
 */
class Mesher {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  /* One vertex with its own normal and colour. */
  vert(p, n, colour) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(colour[0], colour[1], colour[2]);
  }

  tri(a, b, c, colour) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      this.vert(p, n, colour);
    }
  }

  /* A quad a, b, c, d counter clockwise seen from its front. */
  quad(a, b, c, d, colour) {
    this.tri(a, b, c, colour);
    this.tri(a, c, d, colour);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/*
 * The props' material: vertex colour and nothing else, the same program
 * as the cattle's (look.js's 'fauna' parts). A textured material of its
 * own was a new shader program, and every program swiss2 adds past the
 * ones it has costs twelve console warnings at load (GL_INVALID_VALUE,
 * glGetProgramiv: three's bake materials are disposed while the new
 * programs link), which the views' gate holds at fourteen. The boards'
 * grain is laid as geometry instead: a hut's walls are strips of board
 * each its own shade, which is what the photograph showed from thirty
 * metres anyway.
 */
function propMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
}

/* A colour a little lighter or darker, for one board or one row of
 * shingles. */
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/*
 * A hay hut at (x, z), its ridge along `yaw`, w along the ridge and d
 * across it, walls h high at the uphill end. It stands level on the
 * highest of its corners, on a stone plinth down to the lowest.
 */
function hut(m, heightAt, rng, { x, z, yaw, w, d, h, pitch, wall, roof }) {
  const ex = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const ez = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
  const at = (lx, y, lz) => new THREE.Vector3(x, y, z).addScaledVector(ex, lx).addScaledVector(ez, lz);
  const hw = w / 2;
  const hd = d / 2;
  const ground = [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([a, b]) => {
    const p = at(a, 0, b);
    return heightAt(p.x, p.z);
  });
  const top = Math.max(...ground);
  const low = Math.min(...ground);
  const y0 = top + 0.2;
  const eave = y0 + h;
  const ridge = eave + hd * Math.tan(pitch);
  /* The walls, round the four sides in boards a hand and a half wide,
   * and the plinth under them. Wound to face out. */
  const corners = [[hw, hd], [hw, -hd], [-hw, -hd], [-hw, hd]];
  const rows = Math.round(h / 0.3);
  for (let k = 0; k < 4; k += 1) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    for (let r = 0; r < rows; r += 1) {
      const ya = y0 + (h * r) / rows;
      const yb = y0 + (h * (r + 1)) / rows;
      m.quad(at(ax, ya, az), at(bx, ya, bz), at(bx, yb, bz), at(ax, yb, az), shade(wall, 0.82 + 0.3 * rng()));
    }
    const o = 0.06;
    const pa = [ax + Math.sign(ax) * o, az + Math.sign(az) * o];
    const pb = [bx + Math.sign(bx) * o, bz + Math.sign(bz) * o];
    m.quad(at(pa[0], low - 0.4, pa[1]), at(pb[0], low - 0.4, pb[1]), at(pb[0], y0 + 0.25, pb[1]), at(pa[0], y0 + 0.25, pa[1]), STONE);
  }
  /* The gables, and a door in the downhill one with the hay door over
   * it. */
  for (const s of [1, -1]) {
    m.tri(at(s * hw, eave, -s * hd), at(s * hw, ridge, 0), at(s * hw, eave, s * hd), shade(wall, 0.9));
  }
  const dx = -hw - 0.03;
  m.quad(at(dx, y0, 0.6), at(dx, y0 + 1.9, 0.6), at(dx, y0 + 1.9, -0.5), at(dx, y0, -0.5), DOOR);
  m.quad(at(dx, eave - 0.3, 0.45), at(dx, eave + 0.55, 0.45), at(dx, eave + 0.55, -0.45), at(dx, eave - 0.3, -0.45), DOOR);
  /* The roof: two planes over the eaves and the gables in rows of
   * shingle, and their undersides in the shade of the eaves. */
  const o = 0.55;
  const drop = o * Math.tan(pitch);
  const courses = 5;
  for (const s of [1, -1]) {
    for (let r = 0; r < courses; r += 1) {
      const t0 = r / courses;
      const t1 = (r + 1) / courses;
      const y = (t) => ridge + 0.08 + (eave - drop - ridge - 0.08) * t;
      const zz = (t) => s * (hd + o) * t;
      const a = at(hw + o, y(t0), zz(t0));
      const b = at(-hw - o, y(t0), zz(t0));
      const c = at(-hw - o, y(t1), zz(t1));
      const e = at(hw + o, y(t1), zz(t1));
      const tone = shade(roof, 0.85 + 0.25 * rng());
      if (s > 0) {
        m.quad(a, b, c, e, tone);
        m.quad(a, e, c, b, shade(roof, 0.4));
      } else {
        m.quad(b, a, e, c, tone);
        m.quad(b, c, e, a, shade(roof, 0.4));
      }
    }
  }
  return { top: ridge + 0.1, low: low - 0.4 };
}

/* A round bale, r across and len long, lying with its axis along yaw or
 * standing on end. */
function bale(m, heightAt, { x, z, yaw, standing, colour }) {
  const r = 0.62;
  const len = 1.2;
  const y = heightAt(x, z);
  const sides = 10;
  const centre = new THREE.Vector3(x, y + (standing ? len / 2 : r - 0.05), z);
  const axis = standing ? UP.clone() : new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const u = standing ? new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)) : UP.clone();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const ring = (end, k) => {
    const a = (k / sides) * Math.PI * 2;
    return centre.clone().addScaledVector(axis, end * len / 2).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
  };
  const faceEnd = shade(colour, 0.9);
  const c0 = centre.clone().addScaledVector(axis, len / 2);
  const c1 = centre.clone().addScaledVector(axis, -len / 2);
  for (let k = 0; k < sides; k += 1) {
    m.quad(ring(-1, k), ring(-1, k + 1), ring(1, k + 1), ring(1, k), colour);
    m.tri(c0, ring(1, k), ring(1, k + 1), faceEnd);
    m.tri(c1, ring(-1, k + 1), ring(-1, k), faceEnd);
  }
  return centre;
}

/* A fence span along +x, SPAN long: a post at each end (the far one a
 * hair fatter, so where two spans share a post the faces do not fight)
 * and two rails, the rails a shade lighter than the posts. Instanced
 * with x along the span, sheared to its slope. */
function spanGeometry() {
  const parts = [];
  const post = (x, r) => {
    const g = new THREE.BoxGeometry(r, 1.25, r, 1, 1, 1);
    g.translate(x, 0.52, 0);
    parts.push([g, FENCE]);
  };
  post(0, 0.12);
  post(SPAN, 0.13);
  for (const y of [0.5, 0.95]) {
    const g = new THREE.BoxGeometry(SPAN, 0.09, 0.05, 1, 1, 1);
    g.translate(SPAN / 2, y, 0.08);
    parts.push([g, shade(FENCE, 1.2)]);
  }
  const pos = [];
  const nrm = [];
  const col = [];
  for (const [g, c] of parts) {
    const ng = g.toNonIndexed();
    pos.push(...ng.getAttribute('position').array);
    nrm.push(...ng.getAttribute('normal').array);
    for (let k = 0; k < ng.getAttribute('position').count; k += 1) {
      col.push(...c);
    }
    g.dispose();
    ng.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/* A reed clump standing in the water at (x, y, z), s its size: blades
 * from a hand's breadth round its root, each one triangle, leaning out,
 * dark green at the water and green or straw at the tip, their normals
 * out and up from the clump so it shades as one tuft. */
const REED_BASE = [0.035, 0.05, 0.015];
const REED_TIPS = [[0.11, 0.13, 0.05], [0.16, 0.12, 0.06]];
function reedClump(m, rng, x, y, z, s) {
  for (let k = 0; k < 30; k += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.45 * s;
    const h = (1.1 + rng() * 1.1) * s;
    const lean = 0.08 + rng() * 0.3;
    const la = a + (rng() - 0.5) * 1.2;
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    const face = rng() * Math.PI;
    const wx = Math.cos(face) * 0.035;
    const wz = Math.sin(face) * 0.035;
    const n = new THREE.Vector3(Math.cos(a), 1.2, Math.sin(a)).normalize();
    const p0 = new THREE.Vector3(bx - wx, y, bz - wz);
    const p1 = new THREE.Vector3(bx + wx, y, bz + wz);
    const tip = new THREE.Vector3(bx + Math.cos(la) * lean * h, y + h, bz + Math.sin(la) * lean * h);
    const tone = REED_TIPS[rng() < 0.3 ? 1 : 0];
    /* Both faces, the one normal: a blade is lit the same from either
     * side. */
    for (const [a0, a1] of [[p0, p1], [p1, p0]]) {
      m.vert(a0, n, REED_BASE);
      m.vert(a1, n, REED_BASE);
      m.vert(tip, n, tone);
    }
  }
}

/* A box with its centre at c, its axes ex, ey, ez (unit) and half sizes
 * hx, hy, hz, wound to face out. `tones` shades its six faces from one
 * colour, the top lightest. */
function box(m, c, ex, ey, ez, hx, hy, hz, colour, tones = [0.92, 0.92, 1.05, 0.7, 0.86, 0.86]) {
  const at = (a, b, d) => c.clone().addScaledVector(ex, a * hx).addScaledVector(ey, b * hy).addScaledVector(ez, d * hz);
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
    [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
  ];
  faces.forEach((f, k) => {
    m.quad(...f.map((q) => at(...q)), shade(colour, tones[k]));
  });
}

/* The frame (ex along the ground, ez across, ey up) of a thing standing
 * at yaw. */
const frame = (yaw) => [new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), UP.clone(), new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw))];

/* A log from a to b, r thick: `sides` of bark and two cut ends, the ends
 * the pale wood of a freshly split stack. */
function log(m, a, b, r, rng) {
  const axis = b.clone().sub(a).normalize();
  let u = new THREE.Vector3().crossVectors(axis, UP);
  u = u.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : u.normalize();
  const v = new THREE.Vector3().crossVectors(u, axis);
  const sides = 6;
  const turn = rng() * Math.PI;
  const ring = (c, k) => {
    const t = turn + (k / sides) * Math.PI * 2;
    return c.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * r);
  };
  const bark = shade(LOG_BARK, 0.8 + 0.4 * rng());
  const wood = shade(LOG_END, 0.8 + 0.35 * rng());
  for (let k = 0; k < sides; k += 1) {
    m.quad(ring(a, k), ring(a, k + 1), ring(b, k + 1), ring(b, k), bark);
    m.tri(a, ring(a, k + 1), ring(a, k), wood);
    m.tri(b, ring(b, k), ring(b, k + 1), wood);
  }
}

const LOG_BARK = [0.06, 0.045, 0.032];
const LOG_END = [0.42, 0.3, 0.17];
const POST_WHITE = [0.62, 0.62, 0.6];
const HIKING_YELLOW = [0.78, 0.5, 0.02];

/*
 * A stack of firewood against the weather, the Holzbeige every farm
 * keeps by a fence or a hut: split logs a metre long laid across the
 * stack's length, their ends out, on two rails, under a lean of tin on
 * four posts. At (x, z), `len` long along yaw.
 */
function logStack(m, heightAt, rng, { x, z, yaw, len, high }) {
  const [ex, ey, ez] = frame(yaw);
  const y0 = Math.max(...[-1, 1].map((s) => heightAt(x + ex.x * s * len * 0.5, z + ex.z * s * len * 0.5))) + 0.12;
  const at = (a, b, d) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  for (const d of [-0.35, 0.35]) {
    box(m, at(0, -0.06, d), ex, ey, ez, len / 2 + 0.1, 0.07, 0.07, LOG_BARK);
  }
  for (let y = 0.05; y < high; ) {
    const r = 0.08 + 0.05 * rng();
    for (let a = -len / 2 + r; a < len / 2 - r; a += 2 * r * (1 + 0.1 * rng())) {
      const rr = r * (0.85 + 0.3 * rng());
      const off = (rng() - 0.5) * 0.08;
      log(m, at(a, y + rr, -0.5 + off), at(a, y + rr, 0.5 + off), rr, rng);
    }
    y += 2 * r * 0.92;
  }
  /* The lean of tin, falling toward +ez, on a post at each corner. */
  const top = high + 0.35;
  const fall = 0.12;
  for (const a of [-len / 2 - 0.05, len / 2 + 0.05]) {
    for (const d of [-0.55, 0.55]) {
      const post = top + (d < 0 ? fall : 0) + 0.1;
      box(m, at(a, post / 2 - 0.1, d), ex, ey, ez, 0.05, post / 2, 0.05, LOG_BARK);
    }
  }
  const roof = [0.2, 0.2, 0.21];
  const e = len / 2 + 0.3;
  m.quad(at(-e, top + fall, -0.8), at(e, top + fall, -0.8), at(e, top, 0.8), at(-e, top, 0.8), shade(roof, 0.35));
  m.quad(at(-e, top - 0.02, 0.8), at(e, top - 0.02, 0.8), at(e, top + fall - 0.02, -0.8), at(-e, top + fall - 0.02, -0.8), shade(roof, 0.9));
  return { top: y0 + top + 0.2, low: y0 - 0.2 };
}

/* A field gate, closed, between two stout posts `w` apart along yaw:
 * five boards and a brace. */
function gate(m, heightAt, { x, z, yaw, w }) {
  const [ex, ey, ez] = frame(yaw);
  const y0 = heightAt(x, z);
  const at = (a, b) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b);
  for (const a of [-w / 2, w / 2]) {
    box(m, at(a, 0.55), ex, ey, ez, 0.09, 0.8, 0.09, FENCE);
  }
  const boards = shade(FENCE, 1.9);
  for (let k = 0; k < 5; k += 1) {
    box(m, at(0, 0.22 + k * 0.23), ex, ey, ez, w / 2 - 0.1, 0.045, 0.025, shade(boards, 0.9 + 0.08 * (k % 2)));
  }
  const b0 = at(-w / 2 + 0.15, 0.22);
  const b1 = at(w / 2 - 0.15, 1.14);
  const mid = b0.clone().add(b1).multiplyScalar(0.5);
  const along = b1.clone().sub(b0);
  const half = along.length() / 2;
  along.normalize();
  const upv = new THREE.Vector3().crossVectors(ez, along).normalize();
  box(m, mid.addScaledVector(ez, 0.05), along, upv, ez, half, 0.045, 0.025, boards);
}

/* A delineator post at the road's edge, the Swiss kind: a white post a
 * metre high, black at the top with its reflector facing the traffic. */
function delineator(m, heightAt, { x, z, yaw }) {
  const [ex, ey, ez] = frame(yaw);
  const y0 = heightAt(x, z);
  box(m, new THREE.Vector3(x, y0 + 0.4, z), ex, ey, ez, 0.06, 0.4, 0.05, POST_WHITE);
  box(m, new THREE.Vector3(x, y0 + 0.92, z), ex, ey, ez, 0.06, 0.12, 0.05, [0.012, 0.012, 0.012]);
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(x, y0 + 0.93, z).addScaledVector(ex, s * 0.062);
    m.quad(
      c.clone().addScaledVector(ez, s * 0.03).addScaledVector(ey, -0.06),
      c.clone().addScaledVector(ez, -s * 0.03).addScaledVector(ey, -0.06),
      c.clone().addScaledVector(ez, -s * 0.03).addScaledVector(ey, 0.06),
      c.clone().addScaledVector(ez, s * 0.03).addScaledVector(ey, 0.06),
      [0.7, 0.3, 0.02],
    );
  }
  return y0;
}

/* A yellow hiking signpost, as at every Swiss junction of paths: a grey
 * pole with its arrows pointing the ways, `arms` their yaws. */
function signpost(m, heightAt, { x, z, arms }) {
  const y0 = heightAt(x, z);
  const [ex, ey, ez] = frame(0);
  box(m, new THREE.Vector3(x, y0 + 1.3, z), ex, ey, ez, 0.04, 1.3, 0.04, [0.2, 0.2, 0.2]);
  arms.forEach((yaw, k) => {
    const [ax, ay, az] = frame(yaw);
    const y = y0 + 2.35 - k * 0.2;
    const c = new THREE.Vector3(x, y, z).addScaledVector(ax, 0.36);
    box(m, c, ax, ay, az, 0.32, 0.075, 0.012, HIKING_YELLOW, [1, 1, 1, 0.7, 1, 1]);
    /* The point, a wedge at the arrow's end. */
    const tip = c.clone().addScaledVector(ax, 0.44);
    const hi = c.clone().addScaledVector(ax, 0.32).addScaledVector(ay, 0.075);
    const lo = c.clone().addScaledVector(ax, 0.32).addScaledVector(ay, -0.075);
    m.tri(lo, tip, hi, HIKING_YELLOW);
    m.tri(hi, tip, lo, HIKING_YELLOW);
    /* The white field with the black lettering, as a darker band. */
    const f = c;
    for (const s of [1, -1]) {
      const o = az.clone().multiplyScalar(0.014 * s);
      const q = [
        f.clone().addScaledVector(ax, -0.24).addScaledVector(ay, -0.03).add(o),
        f.clone().addScaledVector(ax, 0.2).addScaledVector(ay, -0.03).add(o),
        f.clone().addScaledVector(ax, 0.2).addScaledVector(ay, 0.03).add(o),
        f.clone().addScaledVector(ax, -0.24).addScaledVector(ay, 0.03).add(o),
      ];
      m.quad(...(s > 0 ? q : q.reverse()), [0.05, 0.04, 0.02]);
    }
  });
  box(m, new THREE.Vector3(x, y0 + 2.62, z), ex, ey, ez, 0.12, 0.06, 0.012, [0.7, 0.7, 0.68]);
  return y0;
}

/*
 * A boat shed at the water, its gable to the lake: a timber box on piles
 * with its lake end open over a slip. At (x, z) on the shore, its length
 * along `yaw` pointing out over the water.
 */
function boatShed(m, heightAt, rng, { x, z, yaw, len, w, h }) {
  const [ex, ey, ez] = frame(yaw);
  const y0 = Math.max(LAKE_Y + 0.6, heightAt(x, z) + 0.1);
  const at = (a, b, d) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  const wall = [0.07, 0.048, 0.032];
  /* The piles, down into the lake bed. */
  for (let a = -len / 2; a <= len / 2 + 0.01; a += len / 4) {
    for (const d of [-w / 2, w / 2]) {
      const p = at(a, 0, d);
      const bed = Math.min(heightAt(p.x, p.z), y0) - 0.8;
      box(m, new THREE.Vector3(p.x, (bed + y0) / 2, p.z), ex, ey, ez, 0.11, (y0 - bed) / 2, 0.11, shade(wall, 0.7));
    }
  }
  /* The side walls and the landward gable in boards, the lake end open
   * down to a lintel. */
  const rows = Math.round(h / 0.28);
  for (let r = 0; r < rows; r += 1) {
    const ya = (h * r) / rows;
    const yb = (h * (r + 1)) / rows;
    const tone = shade(wall, 0.8 + 0.35 * rng());
    m.quad(at(-len / 2, ya, w / 2), at(len / 2, ya, w / 2), at(len / 2, yb, w / 2), at(-len / 2, yb, w / 2), tone);
    m.quad(at(len / 2, ya, -w / 2), at(-len / 2, ya, -w / 2), at(-len / 2, yb, -w / 2), at(len / 2, yb, -w / 2), tone);
    m.quad(at(-len / 2, ya, -w / 2), at(-len / 2, ya, w / 2), at(-len / 2, yb, w / 2), at(-len / 2, yb, -w / 2), tone);
    if (ya > h * 0.72) {
      m.quad(at(len / 2, ya, w / 2), at(len / 2, ya, -w / 2), at(len / 2, yb, -w / 2), at(len / 2, yb, w / 2), tone);
    }
  }
  /* The dark inside, seen through the open end. */
  m.quad(at(-len / 2, 0, -w / 2), at(-len / 2, 0, w / 2), at(len / 2 - 0.1, 0, w / 2), at(len / 2 - 0.1, 0, -w / 2), [0.015, 0.013, 0.011]);
  m.quad(at(-len / 2 + 0.05, 0, w / 2), at(-len / 2 + 0.05, 0, -w / 2), at(-len / 2 + 0.05, h, -w / 2), at(-len / 2 + 0.05, h, w / 2), [0.01, 0.009, 0.008]);
  const pitch = 0.62;
  const ridge = h + (w / 2) * Math.tan(pitch);
  for (const a of [-len / 2, len / 2]) {
    m.tri(at(a, h, -w / 2), at(a, ridge, 0), at(a, h, w / 2), shade(wall, 0.9));
    m.tri(at(a, h, w / 2), at(a, ridge, 0), at(a, h, -w / 2), shade(wall, 0.9));
  }
  const roof = [0.1, 0.05, 0.03];
  const o = 0.5;
  const drop = o * Math.tan(pitch);
  for (const s of [1, -1]) {
    const courses = 5;
    for (let r = 0; r < courses; r += 1) {
      const t0 = r / courses;
      const t1 = (r + 1) / courses;
      const y = (t) => ridge + 0.06 + (h - drop - ridge - 0.06) * t;
      const d = (t) => s * (w / 2 + o) * t;
      const a = at(len / 2 + o, y(t0), d(t0));
      const b = at(-len / 2 - o, y(t0), d(t0));
      const c = at(-len / 2 - o, y(t1), d(t1));
      const e = at(len / 2 + o, y(t1), d(t1));
      const tone = shade(roof, 0.85 + 0.25 * rng());
      if (s > 0) {
        m.quad(a, b, c, e, tone);
        m.quad(a, e, c, b, shade(roof, 0.4));
      } else {
        m.quad(b, a, e, c, tone);
        m.quad(b, c, e, a, shade(roof, 0.4));
      }
    }
  }
  return { top: y0 + ridge + 0.2, low: y0 - 1 };
}

/*
 * Build the props. ctx: heightAt, rng, colliders, and footprints, the
 * village's walls, which the huts keep clear of.
 */
export function buildProps(ctx) {
  const { heightAt, rng, colliders } = ctx;
  const layout = valleyLayout(heightAt, ctx.footprints || []);
  const { keepOff, coverOff, streamDist } = layout;
  const group = new THREE.Group();
  group.name = 'swiss2-props';
  const near = (x, z) => colliders && Math.hypot(x, z) < COLLIDE_R;
  const village = ctx.footprints || [];
  const clearOfVillage = (x, z, d) => village.every((f) => Math.hypot(Math.max(f.minX - x, 0, x - f.maxX), Math.max(f.minZ - z, 0, z - f.maxZ)) >= d);
  const slopeAt = (x, z) => {
    const sx = (heightAt(x + 6, z) - heightAt(x - 6, z)) / 12;
    const sz = (heightAt(x, z + 6) - heightAt(x, z - 6)) / 12;
    return { sx, sz, s: Math.hypot(sx, sz) };
  };
  const inLake = (x, z) => z > LAKE_N - 60 && heightAt(x, z) < LAKE_Y + 2.5;

  /* THE HUTS. */
  const m = new Mesher();
  const huts = [];
  const STEP = 40;
  for (let gz = -HALF * 0.95; gz < HALF * 0.95; gz += STEP) {
    for (let gx = -HALF * 0.95; gx < HALF * 0.95; gx += STEP) {
      const x = gx + rng() * STEP;
      const z = gz + rng() * STEP;
      const pick = rng();
      const y = heightAt(x, z);
      const floor = y < 35;
      if (pick > (floor ? 0.1 : 0.05) || y > TREE_LINE - 60 || inLake(x, z)) {
        continue;
      }
      const sl = slopeAt(x, z);
      if (sl.s > 0.55 || forestDensity(x, y, z, sl.s, sl.sz) > 0.04) {
        continue;
      }
      if (keepOff(x, z) || coverOff(x, z) || streamDist(x, z) < 18) {
        continue;
      }
      const f = meadowField(x, z);
      if (floor && (f.plateau > 0.2 || f.edge > 9)) {
        continue;
      }
      if (huts.some((o) => Math.hypot(o.x - x, o.z - z) < 55) || !clearOfVillage(x, z, 35)) {
        continue;
      }
      /* The ridge down the fall line; on the floor along or across the
       * valley. */
      const yaw = sl.s > 0.06
        ? Math.atan2(sl.sz, sl.sx) + (rng() - 0.5) * 0.2
        : Math.atan2(1, (valleyAxis(z + 1) - valleyAxis(z - 1)) / 2) + (rng() < 0.5 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.15;
      /* Larch blackened by the sun, or on the weather side silvered;
       * the roof shingle gone grey, rusted tin, or dark eternit. */
      const k = 0.7 + 0.6 * rng();
      const wall = rng() < 0.2 ? [0.12 * k, 0.11 * k, 0.1 * k] : [0.05 * k, 0.034 * k, 0.022 * k];
      const r = rng();
      const roof = r < 0.25 ? [0.12, 0.052, 0.03] : r < 0.4 ? [0.045, 0.047, 0.05] : [0.1 * k, 0.093 * k, 0.085 * k];
      const spec = { x, z, yaw, w: 5 + 2.5 * rng(), d: 4 + 1.6 * rng(), h: 2.4 + 0.9 * rng(), pitch: 0.42 + 0.2 * rng(), wall, roof };
      const built = hut(m, heightAt, rng, spec);
      huts.push({ x, z });
      if (near(x, z)) {
        const c = Math.abs(Math.cos(yaw));
        const s = Math.abs(Math.sin(yaw));
        const hx = (spec.w / 2 + 0.55) * c + (spec.d / 2 + 0.55) * s;
        const hz = (spec.w / 2 + 0.55) * s + (spec.d / 2 + 0.55) * c;
        colliders.addBox('wall', x - hx, built.low, z - hz, x + hx, built.top, z + hz);
      }
    }
  }

  /* THE BALES: half the fields the paint shows freshly cut have been
   * baled, a loose line of them in each. */
  const baled = new Set();
  let bales = 0;
  for (let gz = -2700; gz < 1850; gz += 22) {
    for (let gx = -520; gx < 520; gx += 22) {
      const x = valleyAxis(gz) + gx;
      const z = gz;
      const f = meadowField(x, z);
      const key = `${f.own[0]},${f.own[1]}`;
      if (f.kind !== 'cut' || baled.has(key) || f.plateau > 0.2 || f.damp > 0.2 || f.edge < 8) {
        continue;
      }
      baled.add(key);
      const pick = noise2(f.own[0] * 0.37 + 0.5, f.own[1] * 0.29 + 0.5);
      if (pick < 0.5 || heightAt(x, z) > 35) {
        continue;
      }
      const dir = rng() * Math.PI * 2;
      const n = 3 + Math.floor(rng() * 8);
      let px = x;
      let pz = z;
      for (let k = 0; k < n; k += 1) {
        px += Math.cos(dir) * (3 + rng() * 5) + (rng() - 0.5) * 2;
        pz += Math.sin(dir) * (3 + rng() * 5) + (rng() - 0.5) * 2;
        const g = meadowField(px, pz);
        if (g.own[0] !== f.own[0] || g.own[1] !== f.own[1] || g.edge < 3 || keepOff(px, pz) || coverOff(px, pz) || streamDist(px, pz) < 10) {
          break;
        }
        const white = rng() < 0.82;
        const c = bale(m, heightAt, {
          x: px, z: pz, yaw: rng() * Math.PI * 2, standing: rng() < 0.35, colour: white ? [0.7, 0.72, 0.7] : [0.22, 0.34, 0.2],
        });
        bales += 1;
        if (near(px, pz)) {
          colliders.addSphere('rock', c.x, c.y, c.z, 0.7);
        }
      }
    }
  }
  /*
   * THE FENCES, round the pastures: the lines between the parcels
   * (zones.js meadowCuts) walked in metre steps and cut into spans; a
   * span is fenced where a fenced pasture lies either side of it and
   * nothing says otherwise.
   */
  const fenced = (x, z) => {
    const f = meadowField(x, z);
    return f.kind === 'pasture' && f.plateau < 0.2 && noise2(f.own[0] * 0.53 + 0.3, f.own[1] * 0.41 + 0.7) > 0.6;
  };
  const spans = [];
  for (const line of meadowCuts(heightAt)) {
    /* Resampled to SPAN along the ground's plan. */
    const pts = [line[0]];
    let carry = 0;
    for (let k = 1; k < line.length; k += 1) {
      const a = line[k - 1];
      const b = line[k];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      let t = SPAN - carry;
      while (t <= len) {
        pts.push({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len });
        t += SPAN;
      }
      carry = len - (t - SPAN);
    }
    for (let k = 0; k + 1 < pts.length; k += 1) {
      const a = pts[k];
      const b = pts[k + 1];
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const nx = -(b.z - a.z) / SPAN;
      const nz = (b.x - a.x) / SPAN;
      if (!fenced(mx + nx * 2, mz + nz * 2) && !fenced(mx - nx * 2, mz - nz * 2)) {
        continue;
      }
      if ([a, b].some((p) => keepOff(p.x, p.z) || coverOff(p.x, p.z) || streamDist(p.x, p.z) < 5 || layout.solidAt(p.x, p.z) || inLake(p.x, p.z) || heightAt(p.x, p.z) > 40)) {
        continue;
      }
      const ay = heightAt(a.x, a.z);
      const by = heightAt(b.x, b.z);
      spans.push({ ax: a.x, ay, az: a.z, bx: b.x, by, bz: b.z });
      if (near(mx, mz)) {
        colliders.add('pole', a.x, ay + 0.75, a.z, b.x, by + 0.75, b.z, 0.35);
      }
    }
  }
  /*
   * THE ROADSIDE. A delineator either side of the valley road every
   * fifty metres, as on every Swiss road outside a village.
   */
  const roadX = (z) => valleyAxis(z) + ROAD_DX;
  const roadYaw = (z) => Math.atan2(1, (valleyAxis(z + 1) - valleyAxis(z - 1)) / 2);
  let delineators = 0;
  for (let z = -2650; z < ROAD_END - 20; z += 50) {
    for (const s of [-1, 1]) {
      const x = roadX(z) + s * 4.3;
      if ((s < 0 && Math.abs(z - STREET_Z) < 14) || heightAt(x, z) > 40 || layout.solidAt(x, z)) {
        continue;
      }
      const y = delineator(m, heightAt, { x, z, yaw: roadYaw(z) });
      delineators += 1;
      if (near(x, z)) {
        colliders.add('pole', x, y, z, x, y + 1.04, z, 0.08);
      }
    }
  }

  /* A fence along `pts` (a polyline), in spans drawn with the others,
   * and its colliders. */
  const fenceAlong = (pts) => {
    for (let k = 0; k + 1 < pts.length; k += 1) {
      const a = pts[k];
      const b = pts[k + 1];
      const n = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / SPAN);
      for (let q = 0; q < n; q += 1) {
        const t0 = (q * SPAN) / Math.hypot(b.x - a.x, b.z - a.z);
        const t1 = ((q + 1) * SPAN) / Math.hypot(b.x - a.x, b.z - a.z);
        const ax = a.x + (b.x - a.x) * t0;
        const az = a.z + (b.z - a.z) * t0;
        const bx = a.x + (b.x - a.x) * t1;
        const bz = a.z + (b.z - a.z) * t1;
        const ay = heightAt(ax, az);
        const by = heightAt(bx, bz);
        spans.push({ ax, ay, az, bx, by, bz });
        if (near((ax + bx) / 2, (az + bz) / 2)) {
          colliders.add('pole', ax, ay + 0.75, az, bx, by + 0.75, bz, 0.35);
        }
      }
    }
  };
  /* The hand placed fences' lines, where the grass grows long. */
  const margins = [];
  /* A gate and the fence either side of it along a straight line from
   * a to b, the gate `at` (0 to 1) of the way along. */
  const gatedFence = (a, b, at) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const g = { x: a.x + ux * len * at, z: a.z + uz * len * at };
    const w = 3.6;
    fenceAlong([a, { x: g.x - ux * (w / 2 + 0.1), z: g.z - uz * (w / 2 + 0.1) }]);
    fenceAlong([{ x: g.x + ux * (w / 2 + 0.1), z: g.z + uz * (w / 2 + 0.1) }, b]);
    const yaw = Math.atan2(uz, ux);
    gate(m, heightAt, { ...g, yaw, w });
    margins.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    if (near(g.x, g.z)) {
      const y = heightAt(g.x, g.z);
      colliders.add('pole', g.x - ux * w / 2, y + 0.7, g.z - uz * w / 2, g.x + ux * w / 2, y + 0.7, g.z + uz * w / 2, 0.45);
    }
    return { ...g, ux, uz };
  };
  const stack = (spec) => {
    const built = logStack(m, heightAt, rng, spec);
    if (near(spec.x, spec.z)) {
      const r = spec.len / 2 + 0.4;
      colliders.addBox('wall', spec.x - r, built.low, spec.z - r, spec.x + r, built.top, spec.z + r);
    }
  };

  /*
   * THE ROAD'S END AT THE LAKE, where the lake-shore view stands: the
   * pasture east of the road fenced along its verge with a gate, logs
   * stacked inside the gate, a hay hut in the field, the yellow sign
   * where the shore path leaves the road, and a boat shed in the reeds
   * west of the jetty. Placed by hand, as a farm's things are.
   */
  const eastFence = (z) => ({ x: roadX(z) + 8.8, z });
  const lakeGate = gatedFence(eastFence(1792), eastFence(1944), (1900 - 1792) / (1944 - 1792));
  stack({ x: lakeGate.x + 3.2, z: lakeGate.z + 8.5, yaw: Math.atan2(lakeGate.uz, lakeGate.ux), len: 3.4, high: 1.35 });
  {
    const x = roadX(1928) + 26;
    const z = 1928;
    hut(m, heightAt, rng, {
      x, z, yaw: 0.08, w: 6, d: 4.6, h: 2.7, pitch: 0.5, wall: [0.05, 0.034, 0.022], roof: [0.12, 0.052, 0.03],
    });
    huts.push({ x, z });
  }
  signpost(m, heightAt, { x: roadX(1936) - 5.4, z: 1936, arms: [Math.PI + 0.1, 0.05, -Math.PI / 2] });
  const { shore: rim, cx: lakeX, cz: lakeZ } = lakeShore(heightAt, 288);
  const shedAt = rim.filter((p) => p.z < lakeZ).reduce((best, p) => (Math.abs(p.x - 162) < Math.abs(best.x - 162) ? p : best));
  const shed = (() => {
    const ox = lakeX - shedAt.x;
    const oz = lakeZ - shedAt.z;
    const l = Math.hypot(ox, oz);
    const x = shedAt.x + (ox / l) * 1.5;
    const z = shedAt.z + (oz / l) * 1.5;
    boatShed(m, heightAt, rng, { x, z, yaw: Math.atan2(oz, ox), len: 9, w: 5.2, h: 2.7 });
    return { x, z };
  })();

  /*
   * THE PASTURE FENCE the farm-low view stands at: from a few metres in
   * front of it away up the field to the north west, a gate in it and a
   * stack of logs inside the gate, the hay meadow either side left long
   * under it (grass.js reads `margins`).
   */
  {
    const a = { x: -45, z: 421 };
    const b = { x: -103, z: 489 };
    const g = gatedFence(a, b, 0.25);
    stack({ x: g.x + g.ux * 7 - g.uz * 2.4, z: g.z + g.uz * 7 + g.ux * 2.4, yaw: Math.atan2(g.uz, g.ux), len: 3, high: 1.25 });
  }

  const fenceMat = propMaterial();
  const fence = new THREE.InstancedMesh(spanGeometry(), fenceMat, Math.max(1, spans.length));
  fence.count = 0;
  fence.visible = false;
  fence.frustumCulled = false;
  fence.castShadow = true;
  fence.receiveShadow = true;
  fence.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fence.name = 'swiss2-fences';
  group.add(fence);
  const spanMatrix = new THREE.Matrix4();
  const fill = (k, s) => {
    /* x along the span (its rise included, so the rails follow the
     * ground and the posts stay upright), y up, z across. */
    const dx = (s.bx - s.ax) / SPAN;
    const dy = (s.by - s.ay) / SPAN;
    const dz = (s.bz - s.az) / SPAN;
    spanMatrix.set(
      dx, 0, -dz, s.ax,
      dy, 1, 0, s.ay,
      dz, 0, dx, s.az,
      0, 0, 0, 1,
    );
    fence.setMatrixAt(k, spanMatrix);
  };

  /* THE GRAVEL BARS, in the static mesh with the rest: grey stones
   * blotched by the noise at a bar's scale, since a bar is mostly seen
   * from the air, and one more draw for the view and each shadow map was
   * more than its texture was worth. Dark and wet at the water, and at
   * the grass's edge grown over; drawn an even pale grey, a bar read from
   * the air as a kerb poured along the stream. */
  const barGeo = gravelBarGeometry(layout.lower, 5.2, layout.groundAt, rng);
  {
    const p = barGeo.getAttribute('position');
    const nr = barGeo.getAttribute('normal');
    const at = new THREE.Vector3();
    const n = new THREE.Vector3();
    const grown = [0.07, 0.08, 0.04];
    for (const i of barGeo.index.array) {
      at.fromBufferAttribute(p, i);
      n.fromBufferAttribute(nr, i);
      const k = 0.55 + 0.6 * noise2(at.x / 5, at.z / 5) + 0.3 * noise2(at.x / 17 + 3.1, at.z / 17);
      const off = streamDist(at.x, at.z);
      const wet = 1 - 0.5 * (1 - smoothstep(2.4, 3.8, off));
      const g = Math.min(1, smoothstep(4, 7.5, off) * 0.6 + smoothstep(0.55, 0.8, noise2(at.x / 7 + 7.7, at.z / 7)));
      const stone = [0.15 * k * wet, 0.145 * k * wet, 0.135 * k * wet];
      m.vert(at, n, stone.map((c, q) => c + (grown[q] - c) * g));
    }
    barGeo.dispose();
  }

  /* THE REED BANK: along the lake's shore where the water is shallow,
   * in beds, thickest on the north shore either side of the jetty and
   * clear of it and of the beach the road comes down to. */
  const clear = jettyClear(heightAt);
  const jettyX = valleyAxis(ROAD_END) + ROAD_DX;
  let reeds = 0;
  for (const s of rim) {
    const north = Math.sin(s.a) < -0.3;
    /* Beds wherever the noise says, and on the north shore a bank either
     * side of the jetty broken only by a gap here and there. */
    const flank = north ? (1 - smoothstep(70, 170, Math.abs(s.x - jettyX))) * smoothstep(0.32, 0.42, noise2(s.x / 22 + 6.1, 3.3)) : 0;
    const bed = Math.max(flank, smoothstep(0.45, 0.6, noise2(s.x / 60 + 2.4, s.z / 60 + 9.1)));
    if (bed <= 0 || (!north && rng() < 0.6)) {
      continue;
    }
    const n = Math.round(bed * (8 + 14 * rng()));
    for (let k = 0; k < n; k += 1) {
      const inward = 0.5 + rng() * 9;
      const x = s.x - Math.cos(s.a) * inward + (rng() - 0.5) * 7;
      const z = s.z - Math.sin(s.a) * inward + (rng() - 0.5) * 7;
      const depth = LAKE_Y - heightAt(x, z);
      if (depth < 0.02 || depth > 0.85 || clear(x, z) || Math.hypot(x - shed.x, z - shed.z) < 9) {
        continue;
      }
      reedClump(m, rng, x, LAKE_Y - depth, z, 0.8 + 0.4 * rng());
      reeds += 1;
    }
  }

  /* The huts, the bales, the bars and the reeds: one draw. */
  const staticMat = propMaterial();
  const staticMesh = new THREE.Mesh(m.geometry(), staticMat);
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  staticMesh.name = 'swiss2-props';
  group.add(staticMesh);

  const here = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const last = new THREE.Vector3(Infinity, 0, 0);
  const lastDir = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const update = (camera) => {
    const pos = camera.getWorldPosition(here);
    camera.getWorldDirection(dir);
    if (pos.distanceToSquared(last) < 9 && dir.dot(lastDir) > 0.9994) {
      return;
    }
    last.copy(pos);
    lastDir.copy(dir);
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    let n = 0;
    for (const s of spans) {
      const dx = s.ax - pos.x;
      const dy = s.ay - pos.y;
      const dz = s.az - pos.z;
      if (dx * dx + dy * dy + dz * dz > FENCE_R * FENCE_R) {
        continue;
      }
      sphere.center.set(s.ax, s.ay, s.az);
      sphere.radius = 6;
      if (frustum.intersectsSphere(sphere)) {
        fill(n, s);
        n += 1;
      }
    }
    fence.count = n;
    fence.visible = n > 0;
    fence.instanceMatrix.clearUpdateRanges();
    fence.instanceMatrix.addUpdateRange(0, n * 16);
    fence.instanceMatrix.needsUpdate = true;
  };
  return {
    group,
    update,
    margins,
    stats: { huts: huts.length, bales, spans: spans.length, reeds, delineators },
    dispose() {
      group.removeFromParent();
      for (const o of [staticMesh, fence]) {
        o.geometry.dispose();
      }
      for (const mat of [staticMat, fenceMat]) {
        mat.dispose();
      }
    },
  };
}
