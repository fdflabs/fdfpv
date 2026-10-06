/*
 * camp.js: the camp at Claro Viejo (TECH-NEEDS M1 assets, MISSIONS.md M1
 * stage 5): four shelters of poles and sagging tarps tied out with
 * ropes, one tarp a person moves, the Column's mark painted under one
 * shelter's roof (mark.js), a lattice mast with a small dish on guy wires
 * that comes down, a solar panel on its stand, crates, drums and
 * jerrycans, sacks and a table under the roofs, hammocks, the cooking
 * fire in its ring of stones with its thin smoke, and the lookout's
 * platform in a tree at the clearing's north edge. Places from
 * src/share/interior/places.js CAMP_PROPS; the motorcycles are
 * vehicles.js's, the people figures.js's.
 *
 * WHAT MOVES, on the room's word (map.setCamp): which of the three
 * markable shelters carries the mark (the dial), how far the side tarp
 * hiding its underside has been pulled back (0 hanging, 1 thrown up on
 * the roof), and how far the mast has come down (0 standing, 1 on the
 * ground). The mast's solids are retired the moment it starts down and
 * restored when it stands again (src/game/collide.js retire), so nothing
 * solid stands where nothing is drawn; its guy wires go slack with it.
 * The smoke drifts on the wall clock (update).
 *
 * SOLID AS DRAWN (interior:collide): every pole a post, each shelter's
 * roof a roof record on them, the platform a box and a roof, the crates,
 * the drums, the jerrycans, the table, the panel and its stand, the
 * mast and its dish boxes and posts. The tarps and the hammocks are
 * cloth, the ropes and the smoke are nothing a craft meets, and what
 * lies on the ground lower than the check's tolerance (sacks, stones,
 * logs, a battery) is ground.
 *
 * WHERE THE CLUTTER GOES. Only the props places.js names are the room's;
 * the rest (what stands under the roofs, by the fire, beside the drums)
 * is this file's dressing, set on each shelter's own frame and left out
 * wherever it would stand in the way of a route the camp's people walk
 * (src/share/interior/routes.js), so nobody walks through a crate.
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

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAMP_PROPS } from '../../share/interior/places.js';
import { ROUTES } from '../../share/interior/routes.js';
import { hash01 } from '../../share/interior/canopy.js';
import { recordAt, shedTop, flatTop } from '../../maps/alps/roofs.js';
import { thermalKind, thermalHide } from '../thermal.js';
import { markPixels, MARK_PX } from './mark.js';
import { makeCampLight } from './camplight.js';
import { DRESSING } from './campdressing.js';

const POLE = [0.2, 0.15, 0.1];
/* Patched, sun faded tarps (linear, under the cloth texture's weave): an
 * olive canvas, a washed blue polythene, a grey green, a khaki. */
const TARPS = [[0.12, 0.13, 0.065], [0.07, 0.13, 0.22], [0.14, 0.15, 0.12], [0.17, 0.13, 0.075]];
const WOOD = [0.3, 0.2, 0.11];
const OLIVE_BOX = [0.12, 0.13, 0.07];
const DRUMS = [[0.07, 0.16, 0.34], [0.3, 0.1, 0.05], [0.1, 0.17, 0.09]];
const JERRY = [[0.3, 0.04, 0.03], [0.1, 0.16, 0.07], [0.45, 0.33, 0.04]];
const SACK = [0.42, 0.36, 0.25];
const STEEL = [0.3, 0.31, 0.32];
const STONE = [0.2, 0.19, 0.17];
const CHAR = [0.035, 0.03, 0.025];
const ROPE = 0x4a4234;
const yawOf = (dx, dz) => Math.atan2(dx, dz);

/*
 * THE ATLAS the solid props are painted from, ATLAS_PX square in four
 * quarters, each a texture the vertex colour multiplies: a plain grain,
 * crate planks, a solar panel's cells (painted in its own colours, its
 * vertices white) and drum metal with ribs and rust. A quarter's corners
 * as [u0, v0, u1, v1], inset a few texels against the mipmaps' bleed.
 */
const ATLAS_PX = 512;
const inset = 4 / ATLAS_PX;
const GRAIN = [inset, inset, 0.5 - inset, 0.5 - inset];
const PLANKS = [0.5 + inset, inset, 1 - inset, 0.5 - inset];
const CELLS = [inset, 0.5 + inset, 0.5 - inset, 1 - inset];
const RIBS = [0.5 + inset, 0.5 + inset, 1 - inset, 1 - inset];

function atlasPixels() {
  const n = ATLAS_PX;
  const h = n / 2;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const qi = i % h;
      const qj = j % h;
      const fine = hash01(i, j, 81);
      const blot = hash01(i >> 4, j >> 4, 82);
      let rgb;
      if (j < h && i < h) {
        const v = 215 + fine * 30 + blot * 10;
        rgb = [v, v, v];
      } else if (j < h) {
        /* Four planks across, a dark gap between, grain along them, one
         * plank a shade off its neighbours, a stencilled band. */
        const plank = Math.floor(qj / (h / 4));
        const gap = qj % (h / 4) < 4 ? 0.45 : 1;
        const grain = 0.86 + 0.14 * hash01(plank, qj >> 1, 83) * (0.6 + 0.4 * Math.sin(qi * 0.05 + plank));
        const tone = 0.85 + 0.15 * hash01(plank, 0, 84);
        const edge = qi < 10 || qi > h - 10 ? 0.75 : 1;
        const v = 255 * gap * grain * tone * edge * (0.92 + fine * 0.08);
        rgb = [v, v * 0.97, v * 0.93];
      } else if (i < h) {
        /* Six by ten cells in a silver frame. */
        const frame = qi < 8 || qi > h - 8 || qj < 8 || qj > h - 8;
        const line = (qi - 8) % 40 < 2 || (qj - 8) % 24 < 2;
        if (frame) {
          rgb = [170, 172, 175];
        } else if (line) {
          rgb = [95, 105, 125];
        } else {
          const glint = 18 * hash01(Math.floor((qi - 8) / 40), Math.floor((qj - 8) / 24), 85);
          rgb = [18 + glint * 0.5, 28 + glint * 0.6, 62 + glint];
        }
      } else {
        /* Ribs round the drum at a third and two thirds, streaks down
         * it, rust in blotches. */
        const rib = Math.abs(qj - h / 3) < 4 || Math.abs(qj - (2 * h) / 3) < 4 ? 0.7 : 1;
        const streak = 0.9 + 0.1 * hash01(qi >> 2, 0, 86);
        const rust = blot > 0.8 ? 0.65 : 1;
        const v = 240 * rib * streak * (0.94 + fine * 0.06);
        rgb = [v, v * (rust === 1 ? 1 : 0.7), v * rust * (rust === 1 ? 1 : 0.5)];
      }
      const k = (j * n + i) * 4;
      data[k] = Math.min(255, rgb[0]);
      data[k + 1] = Math.min(255, rgb[1]);
      data[k + 2] = Math.min(255, rgb[2]);
      data[k + 3] = 255;
    }
  }
  return data;
}

/* The cloth's texture, CLOTH_PX square, repeating every CLOTH_M metres:
 * the weave, the sun's fading in broad soft blotches, water stains and a
 * seam. Near white: the tarp's vertex colour is its colour. */
const CLOTH_PX = 256;
const CLOTH_M = 3;
function clothPixels() {
  const n = CLOTH_PX;
  const data = new Uint8Array(n * n * 4);
  const smooth = (x, y, cell, salt) => {
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    let fx = x / cell - i;
    let fy = y / cell - j;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const w = (a, b) => hash01(((a % (n / cell)) + n / cell) % (n / cell), ((b % (n / cell)) + n / cell) % (n / cell), salt);
    const top = w(i, j) + (w(i + 1, j) - w(i, j)) * fx;
    const bot = w(i, j + 1) + (w(i + 1, j + 1) - w(i, j + 1)) * fx;
    return top + (bot - top) * fy;
  };
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const weave = ((i >> 1) + (j >> 1)) % 2 ? 0.96 : 1;
      const fade = 0.86 + 0.18 * smooth(i, j, 128, 91) + 0.06 * smooth(i, j, 32, 92);
      const stain = 1 - 0.12 * Math.max(0, smooth(i, j, 64, 93) - 0.6) / 0.4;
      const seam = Math.abs(j - 180) < 2 ? 0.8 : 1;
      const v = 225 * weave * fade * stain * seam * (0.96 + 0.04 * hash01(i, j, 94));
      const k = (j * n + i) * 4;
      data[k] = Math.min(255, v);
      data[k + 1] = Math.min(255, v * 0.98);
      data[k + 2] = Math.min(255, v * 0.95);
      data[k + 3] = 255;
    }
  }
  return data;
}

/* The smoke's puff: a soft blot of alpha, uneven at its edge. */
const PUFF_PX = 64;
function puffPixels() {
  const n = PUFF_PX;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n * 2 - 1;
      const v = (j + 0.5) / n * 2 - 1;
      const r = Math.sqrt(u * u + v * v) * (0.85 + 0.3 * hash01(i >> 3, j >> 3, 95));
      const a = Math.max(0, 1 - r) ** 1.6;
      const k = (j * n + i) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = Math.round(255 * a);
    }
  }
  return data;
}

function texture(THREE, pixels, px, { srgb = true, repeat = false } = {}) {
  const tex = new THREE.DataTexture(pixels, px, px, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* A growing merged mesh of triangles with normals, colours and uvs. */
function sink() {
  const pos = [];
  const nrm = [];
  const col = [];
  const uv = [];
  const push = (p, nn, colour, t) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(nn[0], nn[1], nn[2]);
    col.push(colour[0], colour[1], colour[2]);
    uv.push(t[0], t[1]);
  };
  const out = {
    pos, nrm, col, uv,
    /* A flat triangle; t its corners' uvs. */
    tri(a, b, c, colour, t = [[0, 0], [1, 0], [1, 1]]) {
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach((p, k) => push(p, [nx, ny, nz], colour, t[k]));
    },
    /* A triangle with its own normals at the corners. */
    triN(a, b, c, na, nb, nc, colour, t) {
      push(a, na, colour, t[0]);
      push(b, nb, colour, t[1]);
      push(c, nc, colour, t[2]);
    },
    /* A quad a b c d, its uvs the atlas quarter reg's corners. */
    quad(a, b, c, d, colour, two = false, reg = GRAIN) {
      const [u0, v0, u1, v1] = reg;
      const A = [u0, v0]; const B = [u1, v0]; const C = [u1, v1]; const D = [u0, v1];
      out.tri(a, b, c, colour, [A, B, C]);
      out.tri(a, c, d, colour, [A, C, D]);
      if (two) {
        out.tri(c, b, a, colour, [C, B, A]);
        out.tri(d, c, a, colour, [D, C, A]);
      }
    },
  };
  return out;
}

/* An upright box (centre x, z; long axis (dx, dz)) from y0 to y1, its
 * sides painted from reg and its top from top. */
function box(s, cx, cz, dx, dz, w, d, y0, y1, colour, reg = GRAIN, top = reg) {
  const ax = dx * (w / 2); const az = dz * (w / 2);
  const bx = -dz * (d / 2); const bz = dx * (d / 2);
  const c = (y) => [[cx - ax - bx, y, cz - az - bz], [cx + ax - bx, y, cz + az - bz], [cx + ax + bx, y, cz + az + bz], [cx - ax + bx, y, cz - az + bz]];
  const lo = c(y0);
  const hi = c(y1);
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    s.quad(lo[k], lo[k2], hi[k2], hi[k], colour, false, reg);
  }
  s.quad(hi[3], hi[2], hi[1], hi[0], colour, false, top);
}

/* An upright cylinder at (x, z) from y0 to y1, smooth sided, with a top. */
function cylinder(s, x, z, r, y0, y1, colour, reg = GRAIN, seg = 12, lid = colour) {
  const [u0, v0, u1, v1] = reg;
  for (let k = 0; k < seg; k += 1) {
    const a0 = (k / seg) * Math.PI * 2;
    const a1 = ((k + 1) / seg) * Math.PI * 2;
    const n0 = [Math.sin(a0), 0, Math.cos(a0)];
    const n1 = [Math.sin(a1), 0, Math.cos(a1)];
    const p = (n, y) => [x + n[0] * r, y, z + n[2] * r];
    const ua = u0 + (u1 - u0) * (k / seg);
    const ub = u0 + (u1 - u0) * ((k + 1) / seg);
    s.triN(p(n0, y0), p(n1, y0), p(n1, y1), n0, n1, n1, colour, [[ua, v0], [ub, v0], [ub, v1]]);
    s.triN(p(n0, y0), p(n1, y1), p(n0, y1), n0, n1, n0, colour, [[ua, v0], [ub, v1], [ua, v1]]);
    s.tri([x, y1, z], p(n0, y1), p(n1, y1), lid, [[0.25, 0.25], [0.25, 0.25], [0.25, 0.25]]);
  }
}

/* A lying cylinder (a log) from a to b ([x, y, z], its axis), radius r. */
function log(s, a, b, r, colour, seg = 7) {
  const ax = b[0] - a[0]; const az = b[2] - a[2];
  const l = Math.hypot(ax, az) || 1;
  const sx = -az / l; const sz = ax / l;
  for (let k = 0; k < seg; k += 1) {
    const ring = (q) => {
      const t = (q / seg) * Math.PI * 2;
      return [sx * Math.cos(t), Math.sin(t), sz * Math.cos(t)];
    };
    const n0 = ring(k);
    const n1 = ring(k + 1);
    const p = (e, n) => [e[0] + n[0] * r, e[1] + n[1] * r, e[2] + n[2] * r];
    const t = [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4]];
    s.triN(p(a, n0), p(b, n0), p(b, n1), n0, n0, n1, colour, t);
    s.triN(p(a, n0), p(b, n1), p(a, n1), n0, n1, n1, colour, t);
  }
}

/*
 * A sheet of cloth on a grid of ns x nt cells: f(s, t) its point for s
 * and t in [0, 1], its normals by differences, its uvs (s, t) times
 * uvScale; colour one colour, or a function of the cell's middle (s, t).
 * face 'down' turns its front face (and normals) to the ground, 'up' to
 * the sky; left out, they are as f's parameters run.
 */
function sheet(s, f, ns, nt, colour, uvScale = [1, 1], face = null) {
  const P = [];
  for (let j = 0; j <= nt; j += 1) {
    for (let i = 0; i <= ns; i += 1) {
      P.push(f(i / ns, j / nt));
    }
  }
  const at = (i, j) => P[Math.max(0, Math.min(nt, j)) * (ns + 1) + Math.max(0, Math.min(ns, i))];
  let down = false;
  const N = (i, j) => {
    const a = at(i + 1, j); const b = at(i - 1, j); const c = at(i, j + 1); const d = at(i, j - 1);
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    return down ? n.map((x) => -x) : n;
  };
  if (face) {
    down = false;
    down = (N(ns >> 1, nt >> 1)[1] > 0) === (face === 'down');
  }
  const UV = (i, j) => [(i / ns) * uvScale[0], (j / nt) * uvScale[1]];
  for (let j = 0; j < nt; j += 1) {
    for (let i = 0; i < ns; i += 1) {
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const [a, b, c, d] = q.map(([x, y]) => at(x, y));
      const [na, nb, nc, nd] = q.map(([x, y]) => N(x, y));
      const [ta, tb, tc, td] = q.map(([x, y]) => UV(x, y));
      const cc = typeof colour === 'function' ? colour((i + 0.5) / ns, (j + 0.5) / nt) : colour;
      if (down) {
        s.triN(a, c, b, na, nc, nb, cc, [ta, tc, tb]);
        s.triN(a, d, c, na, nd, nc, cc, [ta, td, tc]);
      } else {
        s.triN(a, b, c, na, nb, nc, cc, [ta, tb, tc]);
        s.triN(a, c, d, na, nc, nd, cc, [ta, tc, td]);
      }
    }
  }
}

function meshOf(THREE, s, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* The solid turned box for box(); its collider index. */
function solidBox(colliders, kind, cx, cz, dx, dz, w, d, y0, y1) {
  const u = cx * dx + cz * dz;
  const v = -cx * dz + cz * dx;
  return colliders.addTurnedBox(kind, dx, dz, u - w / 2, u + w / 2, y0, y1, v - d / 2, v + d / 2);
}

/* A shelter's frame: its corners and roof heights. Local u along dir, w
 * across; the roof sheds from the high (front, +w) side to the back. */
function shelterFrame(s, ground) {
  const [cx, cz] = s.at;
  const [dx, dz] = s.dir;
  const g = ground(cx, cz);
  const at = (u, w) => [cx + dx * u - dz * w, cz + dz * u + dx * w];
  return {
    cx, cz, dx, dz, g, at, hi: g + s.h, lo: g + s.h - 0.6,
  };
}

/* The routes' stretches near the camp, for keeping the dressing off them. */
const NEAR_CAMP = 70;
function routeStretches() {
  const [mx, mz] = CAMP_PROPS.middle;
  const out = [];
  for (const r of Object.values(ROUTES)) {
    for (let k = 0; k + 1 < r.pts.length; k += 1) {
      const [a, b] = [r.pts[k], r.pts[k + 1]];
      if (Math.min(Math.hypot(a[0] - mx, a[1] - mz), Math.hypot(b[0] - mx, b[1] - mz)) < NEAR_CAMP + Math.hypot(b[0] - a[0], b[1] - a[1])) {
        out.push([a, b]);
      }
    }
  }
  return out;
}
function clearOf(stretches, x, z, r) {
  for (const [a, b] of stretches) {
    const ex = b[0] - a[0]; const ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    if (Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) < r) {
      return false;
    }
  }
  return true;
}
/* Room a walker needs beside a prop's edge, m. */
const WALKWAY = 0.7;
/* Where the stores stand, camp offsets (m east, m south of its middle),
 * clear of places.js's props and the mast's guy wires; the first is the
 * covered pile. */
const STORES = [[17, -2], [-8, -16], [8, -14], [-16, 9], [5, 17], [-3, 10]];

/* THE LIGHTS (camplight.js), linear colours and strengths (irradiance a
 * metre off): a wood fire's orange, a kerosene lantern's yellow and the
 * bulbs' warm white, each weak beside the 16:40 sun and plain by 18:08.
 * The fill reaches the whole clearing and fades out FILL_OUTER from its
 * middle, a dozen metres under the canopy's edge. */
const FIRE_LIGHT = [1.0, 0.42, 0.12];
const FIRE_STRENGTH = 10;
const FLAME = [1.0, 0.5, 0.16];
const LANTERN = [1.0, 0.68, 0.32];
const BULB = [1.0, 0.78, 0.5];
const FILL_INNER = 24;
const FILL_OUTER = 42;
const BOTTLE = [0.06, 0.16, 0.3];
const TANK = [0.5, 0.5, 0.46];
const RAG = [[0.32, 0.3, 0.26], [0.08, 0.12, 0.22], [0.25, 0.06, 0.04], [0.12, 0.13, 0.07], [0.38, 0.36, 0.32]];
const LITTER = [[0.2, 0.2, 0.2], [0.26, 0.24, 0.2], [0.16, 0.05, 0.04], [0.06, 0.08, 0.12], [0.22, 0.17, 0.1]];

/*
 * THE DRESSING (campdressing.js): a work table, a cooking place with its
 * own small fire, firewood, a water tank and bottles, more crate stacks,
 * a generator, a wheelbarrow, a washing line, a string of bulbs, lanterns
 * under two roofs, and litter. Solid where it stands higher than the
 * collide check's tolerance (prop, crate, post); left out wherever a
 * walker would meet it (clearOf). Pushes the lamps it lights and the
 * glows that draw them onto `lamps` and `glows`.
 */
function dress({
  solid, cloth, colliders, ground, stretches, crate, prop, post, rope, campAt, lamps, glows, frames,
}) {
  const D = DRESSING;
  const turn = (yaw) => [Math.cos(yaw), Math.sin(yaw)];
  const along = (x, z, [dx, dz], u, w) => [x + dx * u - dz * w, z + dz * u + dx * w];
  const lamp = (at, reach, colour, strength, flicker, size) => {
    lamps.push({
      at, reach, colour, strength, flicker,
    });
    glows.push({
      at, size, colour, flicker,
    });
  };

  /* The work table: planks on trestles, a toolbox, a radio, a lantern,
   * a shovel leaning on it. */
  {
    const [x, z] = campAt(D.table.at);
    const d = turn(D.table.yaw);
    if (clearOf(stretches, x, z, 0.9 + WALKWAY)) {
      const g = ground(x, z);
      box(solid, x, z, d[0], d[1], 1.8, 0.75, g + 0.74, g + 0.79, WOOD, PLANKS);
      for (const [u, w] of [[-0.75, -0.3], [0.75, -0.3], [0.75, 0.3], [-0.75, 0.3]]) {
        const [lx, lz] = along(x, z, d, u, w);
        box(solid, lx, lz, d[0], d[1], 0.06, 0.06, g - 0.05, g + 0.74, WOOD);
      }
      const top = g + 0.79;
      const [tx, tz] = along(x, z, d, -0.5, 0.05);
      box(solid, tx, tz, d[0], d[1], 0.5, 0.24, top, top + 0.22, [0.32, 0.05, 0.03], RIBS, GRAIN);
      const [rx, rz] = along(x, z, d, 0.25, -0.1);
      box(solid, rx, rz, d[0], d[1], 0.34, 0.22, top, top + 0.16, [0.04, 0.05, 0.04]);
      const [kx, kz] = along(x, z, d, 0.1, 0.22);
      box(solid, kx, kz, d[0], d[1], 0.45, 0.06, top, top + 0.02, STEEL);
      const [sx, sz] = along(x, z, d, 0.4, 0.68);
      log(solid, [sx, ground(sx, sz), sz], [sx + d[1] * 0.28, top - 0.02, sz - d[0] * 0.28], 0.02, WOOD, 5);
      box(solid, sx, sz, d[0], d[1], 0.22, 0.03, ground(sx, sz) - 0.02, ground(sx, sz) + 0.28, STEEL);
      solidBox(colliders, 'obstacle', x, z, d[0], d[1], 1.8, 1.3, g - 0.05, g + 1.01);
      const [lx, lz] = along(x, z, d, 0.72, 0.1);
      box(solid, lx, lz, 1, 0, 0.12, 0.12, top, top + 0.05, [0.05, 0.05, 0.05]);
      lamp([lx, top + 0.18, lz], 6, LANTERN, 0.8, 0, 0.32);
    }
  }

  /* The cooking place: a ring of stones round a small fire, a tripod of
   * poles with a pot hung over it, a bench log. Its embers are drawn
   * with the camp fire's (buildCamp). */
  const cook = () => {
    const [x, z] = campAt(D.cook.at);
    const g = ground(x, z);
    if (!clearOf(stretches, x, z, 0.7 + WALKWAY)) {
      return null;
    }
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + hash01(k, 0, 71) * 0.4;
      const [sx, sz] = [x + Math.sin(a) * 0.48, z + Math.cos(a) * 0.48];
      const s = 0.12 + hash01(k, 1, 71) * 0.06;
      box(solid, sx, sz, Math.cos(a), -Math.sin(a), s * 1.3, s, ground(sx, sz) - 0.03, ground(sx, sz) + s * 0.8, STONE);
    }
    const apex = [x, g + 1.35, z];
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const [lx, lz] = [x + Math.sin(a) * 0.62, z + Math.cos(a) * 0.62];
      log(solid, [lx, ground(lx, lz) - 0.05, lz], apex, 0.025, POLE, 5);
    }
    colliders.addPost('pole', x, z, g - 0.05, g + 1.3, 0.4);
    cylinder(solid, x, z, 0.16, g + 0.42, g + 0.66, CHAR, GRAIN, 9);
    rope([x, g + 0.66, z], apex);
    const [bx, bz] = [x + 1.25, z + 0.3];
    if (clearOf(stretches, bx, bz, 0.75)) {
      log(solid, [bx - 0.1, ground(bx, bz - 0.7) + 0.12, bz - 0.7], [bx + 0.1, ground(bx, bz + 0.7) + 0.12, bz + 0.7], 0.12, [0.14, 0.1, 0.07]);
    }
    lamp([x, g + 0.35, z], 9, FIRE_LIGHT, FIRE_STRENGTH * 0.45, 2.1, 0.5);
    return [x, z];
  };
  const cookAt = cook();

  /* Firewood: split logs stacked between four stakes. */
  D.firewood.forEach((f, k) => {
    const [x, z] = campAt(f.at);
    const d = turn(f.yaw);
    if (!clearOf(stretches, x, z, 0.6 + WALKWAY)) {
      return;
    }
    const g = ground(x, z) - 0.03;
    const rows = 3 + (k % 2);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < 5 - (r % 2); c += 1) {
        const w = (c - 2 + (r % 2) * 0.5) * 0.15;
        const [ax, az] = along(x, z, d, -0.5, w);
        const [ex, ez] = along(x, z, d, 0.5, w + (hash01(k, r * 7 + c, 72) - 0.5) * 0.05);
        const y = g + 0.07 + r * 0.13;
        log(solid, [ax, y, az], [ex, y, ez], 0.065, [0.26, 0.17, 0.09], 5);
      }
    }
    for (const [u, w] of [[-0.3, -0.42], [0.3, -0.42], [-0.3, 0.42], [0.3, 0.42]]) {
      const [sx, sz] = along(x, z, d, u, w);
      box(solid, sx, sz, d[0], d[1], 0.05, 0.05, g, g + 0.07 + rows * 0.13 + 0.05, POLE);
    }
    solidBox(colliders, 'obstacle', x, z, d[0], d[1], 1.1, 0.94, g, g + 0.07 + rows * 0.13 + 0.1);
  });

  /* The water tank: a white plastic tote in a steel cage on a pallet,
   * and blue bottles. */
  {
    const [x, z] = campAt(D.tank.at);
    const d = turn(D.tank.yaw);
    if (clearOf(stretches, x, z, 0.7 + WALKWAY)) {
      const g = ground(x, z) - 0.03;
      box(solid, x, z, d[0], d[1], 1.2, 1.0, g, g + 0.14, WOOD, PLANKS);
      box(solid, x, z, d[0], d[1], 1.1, 0.92, g + 0.14, g + 1.12, TANK);
      for (const u of [-0.56, -0.19, 0.19, 0.56]) {
        for (const w of [-0.47, 0.47]) {
          const [px, pz] = along(x, z, d, u, w);
          box(solid, px, pz, d[0], d[1], 0.03, 0.03, g + 0.14, g + 1.15, STEEL);
        }
      }
      solidBox(colliders, 'obstacle', x, z, d[0], d[1], 1.2, 1.0, g, g + 1.15);
    }
  }
  D.bottles.forEach(([ox, oz]) => {
    const [x, z] = campAt([ox, oz]);
    if (!clearOf(stretches, x, z, 0.15 + WALKWAY)) {
      return;
    }
    const g = ground(x, z) - 0.03;
    cylinder(solid, x, z, 0.14, g, g + 0.38, BOTTLE, RIBS, 8);
    cylinder(solid, x, z, 0.05, g + 0.38, g + 0.46, BOTTLE, GRAIN, 6);
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.28, 0.28, g, g + 0.46);
  });

  /* Crate stacks: two or three crates, a box on one, sacks at the foot. */
  D.crates.forEach((c, k) => {
    const [x0, z0] = campAt(c.at);
    const d = turn(c.yaw);
    const n = 2 + Math.floor(hash01(k, 0, 73) * 2);
    for (let i = 0; i < n; i += 1) {
      const u = (i - (n - 1) / 2) * 0.95;
      const [x, z] = along(x0, z0, d, u, (hash01(k, i, 74) - 0.5) * 0.12);
      const g = ground(x, z) - 0.05;
      const olive = hash01(k, i, 75) > 0.55;
      if (crate(x, z, d[0], d[1], 0.9, 0.6, 0.55, g, olive ? OLIVE_BOX : WOOD) && hash01(k, i, 76) > 0.4) {
        crate(x, z, d[0], d[1], 0.62, 0.36, 0.32, g + 0.55, OLIVE_BOX);
      }
    }
    const [sx, sz] = along(x0, z0, d, 0, 0.75);
    if (clearOf(stretches, sx, sz, 0.35 + WALKWAY)) {
      box(solid, sx, sz, d[0], d[1], 0.7, 0.45, ground(sx, sz) - 0.05, ground(sx, sz) + 0.18, SACK);
    }
  });

  /* The generator, a framed engine, its cable to the mast's foot. */
  {
    const [x, z] = campAt(D.generator.at);
    const d = turn(D.generator.yaw);
    if (clearOf(stretches, x, z, 0.4 + WALKWAY)) {
      const g = ground(x, z) - 0.03;
      box(solid, x, z, d[0], d[1], 0.62, 0.44, g + 0.06, g + 0.46, [0.32, 0.22, 0.03], RIBS, GRAIN);
      box(solid, x, z, d[0], d[1], 0.68, 0.5, g, g + 0.06, STEEL);
      box(solid, x - d[0] * 0.1, z - d[1] * 0.1, d[0], d[1], 0.3, 0.3, g + 0.46, g + 0.55, [0.04, 0.04, 0.04]);
      solidBox(colliders, 'obstacle', x, z, d[0], d[1], 0.68, 0.5, g, g + 0.55);
      const [mx, mz] = CAMP_PROPS.mast.at;
      rope([x, g + 0.1, z], [mx, ground(mx, mz) + 0.04, mz]);
    }
  }

  /* The wheelbarrow, its tray tipped forward onto the wheel, and sacks
   * of rice and flour beside it. */
  {
    const [x, z] = campAt(D.wheelbarrow.at);
    const d = turn(D.wheelbarrow.yaw);
    if (clearOf(stretches, x, z, 0.7 + WALKWAY)) {
      const g = ground(x, z);
      box(solid, x, z, d[0], d[1], 0.75, 0.58, g + 0.3, g + 0.55, [0.12, 0.18, 0.12], RIBS, GRAIN);
      const [wx, wz] = along(x, z, d, 0.5, 0);
      log(solid, [wx - d[1] * 0.05, g + 0.19, wz + d[0] * 0.05], [wx + d[1] * 0.05, g + 0.19, wz - d[0] * 0.05], 0.19, [0.03, 0.03, 0.03], 9);
      for (const w of [-0.22, 0.22]) {
        const [ax, az] = along(x, z, d, 0.45, w);
        const [ex, ez] = along(x, z, d, -0.7, w * 1.3);
        log(solid, [ax, g + 0.32, az], [ex, g + 0.5, ez], 0.02, STEEL, 5);
      }
      solidBox(colliders, 'obstacle', x - d[0] * 0.05, z - d[1] * 0.05, d[0], d[1], 1.4, 0.65, g - 0.05, g + 0.58);
      for (let k = 0; k < 2; k += 1) {
        const [sx, sz] = along(x, z, d, -0.2 + k * 0.6, -0.85);
        box(solid, sx, sz, d[0], d[1], 0.55, 0.38, ground(sx, sz) - 0.05, ground(sx, sz) + 0.24, k ? [0.5, 0.48, 0.42] : SACK);
      }
    }
  }

  /* The washing line: two poles, a sagging line, a few shirts and a
   * towel pegged on it. */
  {
    const a = campAt(D.clothesline.from);
    const b = campAt(D.clothesline.to);
    if (clearOf(stretches, a[0], a[1], 0.1 + WALKWAY) && clearOf(stretches, b[0], b[1], 0.1 + WALKWAY)) {
      const ga = ground(a[0], a[1]);
      const gb = ground(b[0], b[1]);
      post(a[0], a[1], ga - 0.2, ga + 1.95, 0.04);
      post(b[0], b[1], gb - 0.2, gb + 1.95, 0.04);
      const at = (t) => [a[0] + (b[0] - a[0]) * t, ga + 1.9 + (gb - ga) * t - 0.25 * Math.sin(Math.PI * t), a[1] + (b[1] - a[1]) * t];
      for (let k = 0; k < 8; k += 1) {
        rope(at(k / 8), at((k + 1) / 8));
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [ux, uz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (let k = 0; k < 5; k += 1) {
        const t0 = 0.12 + k * 0.16;
        const wide = (0.45 + 0.2 * hash01(k, 0, 77)) / len;
        const drop = 0.5 + 0.25 * hash01(k, 1, 77);
        sheet(cloth, (s, t) => {
          const p = at(t0 + s * wide);
          return [p[0] - uz * 0.03 * Math.sin(s * 5 + k) * t, p[1] - t * drop, p[2] + ux * 0.03 * Math.sin(s * 5 + k) * t];
        }, 2, 2, RAG[k % RAG.length], [0.3, 0.3]);
      }
    }
  }

  /* The string of bulbs between two tall poles, sagging over the walkers,
   * lit as two lamps along it. */
  {
    const B = D.bulbs;
    const a = campAt(B.from);
    const b = campAt(B.to);
    if (clearOf(stretches, a[0], a[1], 0.1 + WALKWAY) && clearOf(stretches, b[0], b[1], 0.1 + WALKWAY)) {
      const ga = ground(a[0], a[1]);
      const gb = ground(b[0], b[1]);
      post(a[0], a[1], ga - 0.2, ga + B.h + 0.1, 0.05);
      post(b[0], b[1], gb - 0.2, gb + B.h + 0.1, 0.05);
      const at = (t) => [a[0] + (b[0] - a[0]) * t, ga + B.h + (gb - ga) * t - B.sag * 4 * t * (1 - t), a[1] + (b[1] - a[1]) * t];
      for (let k = 0; k < 12; k += 1) {
        rope(at(k / 12), at((k + 1) / 12));
      }
      for (let k = 0; k < B.n; k += 1) {
        const p = at((k + 0.5) / B.n);
        glows.push({
          at: [p[0], p[1] - 0.08, p[2]], size: 0.3, colour: BULB.map((v) => v * 0.45), flicker: 0,
        });
      }
      for (const t of [0.28, 0.72]) {
        const p = at(t);
        lamps.push({
          at: [p[0], p[1] - 0.1, p[2]], reach: 9, colour: BULB, strength: 2.2, flicker: 0,
        });
      }
    }
  }

  /* Lanterns hung under two roofs, a hand under the tarp's middle. */
  for (const id of ['shelter-1', 'shelter-3']) {
    const f = frames[id];
    lamp([f.cx, (f.hi + f.lo) / 2 - 0.55, f.cz], 7, LANTERN, 1.6, 0, 0.36);
  }

  /* Litter lying flat: cans, a sheet of sacking, a bottle, offcuts,
   * thinner toward the clearing's edge, none in the fires. */
  const [fx, fz] = CAMP_PROPS.fire.at;
  for (let k = 0; k < D.litter; k += 1) {
    const r = 19 * Math.sqrt(hash01(k, 0, 78)) * (0.4 + 0.6 * hash01(k, 1, 78));
    const a = hash01(k, 2, 78) * Math.PI * 2;
    const [x, z] = campAt([Math.sin(a) * r, Math.cos(a) * r]);
    if (Math.hypot(x - fx, z - fz) < 1.2) {
      continue;
    }
    const kind = Math.floor(hash01(k, 3, 78) * LITTER.length);
    const t = hash01(k, 4, 78) * Math.PI;
    const [w, d, h] = kind < 2 ? [0.12, 0.07, 0.07] : kind === 4 ? [0.6, 0.45, 0.02] : [0.3, 0.18, 0.04];
    const g = ground(x, z) - 0.02;
    box(solid, x, z, Math.cos(t), Math.sin(t), w, d, g, g + h, LITTER[kind]);
  }
  return { cook: cookAt };
}

/*
 * The camp: { group, setCamp({ mark, tarp, mast }), update(seconds),
 * stats(), dispose() }. Adds its colliders and roof records.
 */
export function buildCamp({
  THREE, world, colliders, roofs,
}) {
  const ground = world.groundAt;
  const group = new THREE.Group();
  group.name = 'interior-camp';
  const campAt = ([ox, oz]) => [CAMP_PROPS.middle[0] + ox, CAMP_PROPS.middle[1] + oz];
  const solid = sink();
  const cloth = sink();
  const ropes = [];
  const stretches = routeStretches();
  /* The mark is under the roof: its pane faces down and is drawn only
   * from below. */
  const markMat = thermalKind(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), 'vegetation');
  const tex = texture(THREE, markPixels(), MARK_PX);
  tex.flipY = true;
  markMat.map = tex;
  const atlas = texture(THREE, atlasPixels(), ATLAS_PX);
  const weave = texture(THREE, clothPixels(), CLOTH_PX, { repeat: true });
  let count = 0;
  const post = (x, z, y0, y1, r) => {
    box(solid, x, z, 1, 0, r * 2, r * 2, y0, y1, POLE);
    colliders.addPost('pole', x, z, y0, y1 - r, r * 1.1);
    count += 1;
  };
  /* A solid box prop, painted and solid alike. */
  const prop = (x, z, dx, dz, w, d, y0, y1, colour, reg = GRAIN, top = reg) => {
    box(solid, x, z, dx, dz, w, d, y0, y1, colour, reg, top);
    solidBox(colliders, 'obstacle', x, z, dx, dz, w, d, y0, y1);
    count += 1;
  };
  const rope = (a, b) => ropes.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  /* A crate where a walker leaves room for it; a lid of planks. */
  const crate = (x, z, dx, dz, w, d, h, y0, colour = WOOD) => {
    if (!clearOf(stretches, x, z, Math.max(w, d) / 2 + WALKWAY)) {
      return false;
    }
    prop(x, z, dx, dz, w, d, y0, y0 + h, colour, PLANKS, PLANKS);
    return true;
  };

  /* THE SHELTERS. */
  const frames = {};
  const markPanes = {};
  const flaps = {};
  const plainMats = {};
  CAMP_PROPS.shelters.forEach((s, k) => {
    const f = shelterFrame(s, ground);
    frames[s.id] = f;
    const hu = s.w / 2;
    const hw = s.d / 2;
    const colour = TARPS[k % TARPS.length];
    const corners = [[-hu, hw, f.hi], [hu, hw, f.hi], [hu, -hw, f.lo], [-hu, -hw, f.lo]];
    for (const [u, w, top] of corners) {
      const [x, z] = f.at(u, w);
      post(x, z, ground(x, z) - 0.2, top, 0.05);
    }
    /* The tarp roof, out past the poles by a hand's breadth, sagging
     * between them; its underside a separate pane a finger under it,
     * the mark's where the dial says. */
    const sag = 0.15 + 0.05 * hash01(k, 1, 41);
    const roof = (dy) => (a, b) => {
      const u = (a * 2 - 1) * hu * 1.1;
      const w = (b * 2 - 1) * hw * 1.12;
      const [x, z] = f.at(u, w);
      const plane = f.lo + (f.hi - f.lo) * b + 0.02;
      /* Most in the middle, and the edges between the poles hang too. */
      const sa = Math.sin(Math.PI * a);
      const sb = Math.sin(Math.PI * b);
      const droop = sag * (0.6 * sa * sb + 0.22 * (sa + sb));
      const ripple = 0.025 * Math.sin(a * 17 + k) * Math.sin(b * 9 + k * 2);
      return [x, plane - droop + ripple + dy, z];
    };
    /* Grimed toward the edges, faded where the sun sits longest, and
     * patched with an offcut of another tarp or two. */
    const weathered = (a, b) => {
      const edge = Math.min(1, Math.min(a, 1 - a, b, 1 - b) * 5);
      const tone = (0.88 + 0.12 * edge) * (0.96 + 0.1 * Math.sin(Math.PI * a) * Math.sin(Math.PI * b));
      return colour.map((v) => v * tone);
    };
    sheet(cloth, roof(0), 10, 8, weathered, [(hu * 2.2) / CLOTH_M, (hw * 2.24) / CLOTH_M]);
    for (let q = 0; q < 1 + Math.floor(hash01(k, 2, 41) * 2); q += 1) {
      const pa = 0.2 + hash01(k, q, 42) * 0.45;
      const pb = 0.2 + hash01(k, q, 43) * 0.45;
      const sa = 0.13 + hash01(k, q, 44) * 0.12;
      const sb = 0.15 + hash01(k, q, 45) * 0.15;
      const offcut = TARPS[(k + 1 + q) % TARPS.length].map((v) => v * 0.9);
      sheet(cloth, (a, b) => roof(0.012)(pa + a * sa, pb + b * sb), 2, 2, offcut, [sa * (hu * 2.2) / CLOTH_M, sb * (hw * 2.24) / CLOTH_M]);
    }
    const pane = sink();
    sheet(pane, roof(-0.015), 10, 8, [1, 1, 1], [1, 1], 'down');
    plainMats[s.id] = thermalKind(new THREE.MeshStandardMaterial({ color: new THREE.Color(...colour), map: weave, roughness: 1 }), 'vegetation');
    const paneMesh = meshOf(THREE, pane, plainMats[s.id], `interior-camp-underside-${s.id}`);
    markPanes[s.id] = paneMesh;
    group.add(paneMesh);
    const rec = recordAt({
      top: shedTop(-hw * 1.12, f.hi - f.lo, hw * 1.12, 0, -hu * 1.1, hu * 1.1), dy: 0.05, hw: hw * 1.12, hd: hu * 1.1, open: true, kind: 'shelter',
    }, `tin:${s.id}`, f.cx, f.lo, f.cz, yawOf(f.dx, f.dz));
    rec.material = 'wood';
    rec.solids = [];
    rec.eaves = [];
    roofs.push(rec);
    /* Guy ropes from the roof's corners out to stakes. */
    for (const [u, w] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const [x, z] = f.at(u * hu * 1.1, w * hw * 1.12);
      const [sx, sz] = f.at(u * (hu * 1.1 + 0.9), w * (hw * 1.12 + 1.1));
      rope([x, (w > 0 ? f.hi : f.lo) + 0.02, z], [sx, ground(sx, sz) + 0.05, sz]);
    }
    /* Off the low edge, a short valance; the shelter nothing is marked
     * on hangs a wall of tarp there instead, down near the ground. */
    const drop = s.markable ? 0.3 : f.lo - f.g - 0.35;
    sheet(cloth, (a, b) => {
      const u = (a * 2 - 1) * hu * 1.1;
      const [x, z] = f.at(u, -hw * 1.12 - b * 0.12);
      const sway = 0.03 * Math.sin(a * 13 + k);
      return [x + sway, f.lo + 0.02 - b * drop, z];
    }, 8, 2, TARPS[(k + 2) % TARPS.length], [(hu * 2.2) / CLOTH_M, drop / CLOTH_M]);
    /* The side tarp hanging off the high edge, hiding the roof's underside
     * from the open side until it is thrown back (setCamp tarp). */
    if (s.markable) {
      const flap = sink();
      sheet(flap, (a, b) => [(a * 2 - 1) * hu * 1.1, -b * 1.5, 0.04 * Math.sin(a * 11 + k) * b], 8, 3, TARPS[(k + 1) % TARPS.length], [(hu * 2.2) / CLOTH_M, 1.5 / CLOTH_M]);
      const fm = meshOf(THREE, flap, null, `interior-camp-flap-${s.id}`);
      fm.material = null;
      const [x, z] = f.at(0, hw * 1.12);
      fm.position.set(x, f.hi + 0.02, z);
      fm.rotation.y = yawOf(f.dx, f.dz) - Math.PI / 2;
      flaps[s.id] = fm;
      group.add(fm);
    }
    /* Under the roof, along its back: crates, a stack of two, sacks and
     * a jerrycan, wherever no walker passes. */
    const g0 = (x, z) => ground(x, z) - 0.05;
    const yaw = [f.dx, f.dz];
    for (let c = 0; c < 3; c += 1) {
      const u = (c - 1) * hu * 0.55 + (hash01(k, c, 42) - 0.5) * 0.4;
      const w = -hw * 0.55 + hash01(k, c, 43) * 0.3;
      const [x, z] = f.at(u, w);
      const big = hash01(k, c, 44) > 0.4;
      const [cw, cd, ch] = big ? [0.9, 0.6, 0.55] : [0.62, 0.36, 0.32];
      if (crate(x, z, yaw[0], yaw[1], cw, cd, ch, g0(x, z), big ? WOOD : OLIVE_BOX) && hash01(k, c, 45) > 0.45) {
        const t = 0.12 * (hash01(k, c, 46) - 0.5);
        crate(x, z, Math.cos(t) * yaw[0] - Math.sin(t) * yaw[1], Math.sin(t) * yaw[0] + Math.cos(t) * yaw[1], 0.62, 0.36, 0.32, g0(x, z) + ch, OLIVE_BOX);
      }
    }
    for (let c = 0; c < 3; c += 1) {
      const [x, z] = f.at((hash01(k, c, 47) - 0.5) * hu * 1.4, -hw * 0.2 + hash01(k, c, 48) * 0.6);
      if (clearOf(stretches, x, z, 0.4 + WALKWAY)) {
        box(solid, x, z, f.dx, f.dz, 0.7, 0.45, g0(x, z), g0(x, z) + 0.27, SACK);
      }
    }
    {
      const [x, z] = f.at(hu * 0.7, -hw * 0.75);
      if (clearOf(stretches, x, z, 0.3 + WALKWAY)) {
        prop(x, z, f.dx, f.dz, 0.36, 0.17, g0(x, z), g0(x, z) + 0.47, JERRY[k % JERRY.length], RIBS, GRAIN);
      }
    }
  });

  /* A table of planks on trestles under the second shelter, a radio set
   * and a box on it. */
  {
    const f = frames['shelter-2'];
    const [x, z] = f.at(-0.9, 0.3);
    if (clearOf(stretches, x, z, 0.9 + WALKWAY)) {
      const g = ground(x, z);
      box(solid, x, z, f.dx, f.dz, 1.6, 0.7, g + 0.72, g + 0.77, WOOD, PLANKS);
      for (const [u, w] of [[-0.7, -0.28], [0.7, -0.28], [0.7, 0.28], [-0.7, 0.28]]) {
        const [lx, lz] = [x + f.dx * u - f.dz * w, z + f.dz * u + f.dx * w];
        box(solid, lx, lz, 1, 0, 0.06, 0.06, g - 0.05, g + 0.72, WOOD);
      }
      solidBox(colliders, 'obstacle', x, z, f.dx, f.dz, 1.6, 0.7, g - 0.05, g + 0.77);
      box(solid, x - f.dx * 0.3, z - f.dz * 0.3, f.dx, f.dz, 0.42, 0.3, g + 0.77, g + 0.97, [0.05, 0.06, 0.05]);
      box(solid, x + f.dx * 0.35, z + f.dz * 0.35, f.dx, f.dz, 0.4, 0.3, g + 0.77, g + 0.92, OLIVE_BOX, PLANKS);
      count += 1;
    }
  }

  /* THE SOLAR PANEL on its stand: a framed panel of cells tilted to the
   * sky on a post and two back legs, a battery box at its foot. */
  {
    const p = CAMP_PROPS.solar;
    const [x, z] = p.at;
    const g = ground(x, z);
    box(solid, x, z, 1, 0, 0.12, 0.12, g - 0.1, g + 0.9, STEEL);
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.14, 0.14, g - 0.1, g + 0.9);
    const [dx, dz] = p.dir;
    const a = [x - dz * 0.8, g + 0.95, z + dx * 0.8];
    const b = [x + dz * 0.8, g + 0.95, z - dx * 0.8];
    const c = [b[0] - dx * 1.0, g + 1.45, b[2] - dz * 1.0];
    const d = [a[0] - dx * 1.0, g + 1.45, a[2] - dz * 1.0];
    solid.quad(a, b, c, d, [1, 1, 1], false, CELLS);
    solid.quad(d, c, b, a, [0.1, 0.1, 0.11], false, GRAIN);
    /* The frame's rim, a few centimetres proud, all round. */
    const lift = (q, h) => [q[0], q[1] + h, q[2]];
    for (const [e0, e1] of [[a, b], [b, c], [c, d], [d, a]]) {
      solid.quad(e0, e1, lift(e1, 0.04), lift(e0, 0.04), STEEL, true);
    }
    /* The panel's solid: the box it tilts inside, half a metre deep. */
    solidBox(colliders, 'obstacle', x - dx * 0.5, z - dz * 0.5, -dz, dx, 1.6, 1.0, g + 0.9, g + 1.5);
    for (const q of [c, d]) {
      const lx = q[0] + dx * 0.08;
      const lz = q[2] + dz * 0.08;
      box(solid, lx, lz, 1, 0, 0.05, 0.05, ground(lx, lz) - 0.1, q[1], STEEL);
      colliders.addPost('pole', lx, lz, ground(lx, lz) - 0.1, q[1] - 0.03, 0.04);
    }
    box(solid, x + dx * 0.5, z + dz * 0.5, dx, dz, 0.4, 0.25, g - 0.05, g + 0.24, [0.04, 0.04, 0.045]);
    count += 4;
  }
  /* CRATES, stacked where places.js sets them; DRUMS, round, ribbed, a
   * blue, a rust red, a green, and jerrycans beside them. */
  CAMP_PROPS.crates.forEach(([x, z], k) => {
    const g = ground(x, z);
    const t = (hash01(k, 0, 51) - 0.5) * 0.5;
    const [dx, dz] = [Math.cos(t), Math.sin(t)];
    prop(x, z, dx, dz, 0.9, 0.6, g - 0.05, g + 0.55, WOOD, PLANKS, PLANKS);
    if (hash01(k, 1, 51) > 0.35) {
      const t2 = t + (hash01(k, 2, 51) - 0.5) * 0.4;
      prop(x, z, Math.cos(t2), Math.sin(t2), 0.62, 0.36, g + 0.55, g + 0.87, OLIVE_BOX, PLANKS);
    }
  });
  CAMP_PROPS.drums.forEach(([x, z], k) => {
    const g = ground(x, z);
    const colour = DRUMS[k % DRUMS.length];
    cylinder(solid, x, z, 0.28, g - 0.05, g + 0.9, colour, RIBS, 12, colour.map((v) => v * 0.7));
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.56, 0.56, g - 0.05, g + 0.9);
    count += 1;
  });
  {
    const [x0, z0] = CAMP_PROPS.drums[0];
    for (let k = 0; k < 3; k += 1) {
      const x = x0 - 0.9 + k * 0.42;
      const z = z0 - 0.7;
      if (clearOf(stretches, x, z, 0.25 + WALKWAY)) {
        const g = ground(x, z);
        prop(x, z, 1, 0, 0.36, 0.17, g - 0.05, g + 0.47, JERRY[k % JERRY.length], RIBS, GRAIN);
      }
    }
  }
  /* STORES round the clearing's edge: crates in twos and threes, a box on
   * top, a jerrycan; one pile of sacks under a tarp tied down over it. */
  const [cmx, cmz] = CAMP_PROPS.middle;
  STORES.forEach(([ox, oz], k) => {
    const x0 = cmx + ox;
    const z0 = cmz + oz;
    const t = hash01(k, 0, 53) * Math.PI;
    const [dx, dz] = [Math.cos(t), Math.sin(t)];
    if (k === 0) {
      if (!clearOf(stretches, x0, z0, 1.1 + WALKWAY)) {
        return;
      }
      const g = ground(x0, z0) - 0.05;
      prop(x0, z0, dx, dz, 1.8, 1.1, g, g + 0.75, SACK);
      sheet(cloth, (a, b) => {
        const u = (a - 0.5) * 2.2;
        const w = (b - 0.5) * 1.5;
        const over = Math.max(0, Math.abs(u) - 0.9) + Math.max(0, Math.abs(w) - 0.55);
        const y = g + 0.8 - Math.min(0.6, over * 2.2) + 0.03 * Math.sin(a * 9 + b * 7);
        return [x0 + dx * u - dz * w, y, z0 + dz * u + dx * w];
      }, 8, 6, TARPS[1], [2.2 / CLOTH_M, 1.5 / CLOTH_M]);
      return;
    }
    for (let c = 0; c < 4; c += 1) {
      const u = (c % 2 - 0.5) * 0.95 + (hash01(k, c, 54) - 0.5) * 0.15;
      const w = (c < 2 ? 0 : 0.7) + (hash01(k, c, 55) - 0.5) * 0.15;
      const [x, z] = [x0 + dx * u - dz * w, z0 + dz * u + dx * w];
      if (c === 3) {
        if (clearOf(stretches, x, z, 0.25 + WALKWAY)) {
          const g = ground(x, z) - 0.05;
          prop(x, z, dx, dz, 0.36, 0.17, g, g + 0.52, JERRY[k % JERRY.length], RIBS, GRAIN);
        }
        continue;
      }
      const g = ground(x, z) - 0.05;
      if (crate(x, z, dx, dz, 0.9, 0.6, 0.55, g, c === 2 ? OLIVE_BOX : WOOD) && hash01(k, c, 56) > 0.5) {
        crate(x, z, dx, dz, 0.62, 0.36, 0.32, g + 0.55, OLIVE_BOX);
      }
    }
  });
  const lamps = [];
  const glows = [];
  const dressed = dress({
    solid, cloth, colliders, ground, stretches, crate, prop, post, rope, campAt, lamps, glows, frames,
  });
  /* THE FIRE: the embers (the fire kind, src/render/thermal.js, far over
   * anything else in the camp) in a ring of stones, half burnt logs, a
   * blackened pot on the stones, logs round it to sit on. */
  const fireMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0x5a2208, roughness: 1 }), 'fire');
  const [fx, fz] = CAMP_PROPS.fire.at;
  const fg = ground(fx, fz);
  {
    /* Both fires' embers, this one and the cooking place's (dress), one
     * mesh. */
    const embers = [[fx, fz, 0.7]];
    if (dressed.cook) {
      embers.push([...dressed.cook, 0.38]);
    }
    const discs = embers.map(([x, z, r]) => new THREE.CircleGeometry(r, 10).rotateX(-Math.PI / 2).translate(x, ground(x, z) + 0.05, z));
    const disc = new THREE.Mesh(mergeGeometries(discs), fireMat);
    disc.name = 'interior-camp-fire';
    group.add(disc);
    for (let k = 0; k < 11; k += 1) {
      const a = (k / 11) * Math.PI * 2 + hash01(k, 0, 52) * 0.3;
      const r = 0.82;
      const x = fx + Math.sin(a) * r;
      const z = fz + Math.cos(a) * r;
      const sz = 0.16 + hash01(k, 1, 52) * 0.1;
      box(solid, x, z, Math.cos(a), -Math.sin(a), sz * 1.3, sz, ground(x, z) - 0.03, ground(x, z) + sz * 0.8, STONE);
    }
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      log(solid, [fx + Math.sin(a) * 0.1, fg + 0.08, fz + Math.cos(a) * 0.1], [fx + Math.sin(a) * 0.7, fg + 0.1, fz + Math.cos(a) * 0.7], 0.055, CHAR);
    }
    cylinder(solid, fx + 0.55, fz - 0.55, 0.13, fg + 0.1, fg + 0.28, CHAR, GRAIN, 9);
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + 1.1;
      const [x, z] = [fx + Math.sin(a) * 2.2, fz + Math.cos(a) * 2.2];
      const [ex, ez] = [Math.cos(a) * 0.8, -Math.sin(a) * 0.8];
      if (clearOf(stretches, x, z, 0.5)) {
        log(solid, [x - ex, ground(x - ex, z - ez) + 0.13, z - ez], [x + ex, ground(x + ex, z + ez) + 0.13, z + ez], 0.13, [0.14, 0.1, 0.07]);
      }
    }
  }
  lamps.unshift({
    at: [fx, fg + 0.7, fz], reach: 16, colour: FIRE_LIGHT, strength: FIRE_STRENGTH, flicker: 1.3,
  });
  for (let k = 0; k < 5; k += 1) {
    const a = k * 2.4;
    glows.push({
      at: [fx + 0.18 * Math.sin(a), fg + 0.22 + 0.09 * k, fz + 0.18 * Math.cos(a)], size: 0.62 - 0.06 * k, colour: FLAME.map((v) => v * 0.9), flicker: 1.3 + k * 0.7,
    });
  }
  const campLight = makeCampLight(THREE, {
    at: CAMP_PROPS.middle, inner: FILL_INNER, outer: FILL_OUTER, lamps, glows,
  });
  group.add(campLight.mesh);

  /* HAMMOCKS, slung between two poles: a woven strip sagging between
   * its ropes, in faded stripes. */
  CAMP_PROPS.hammocks.forEach((h, k) => {
    const [ax, az] = h.from;
    const [bx, bz] = h.to;
    for (const [x, z] of [h.from, h.to]) {
      post(x, z, ground(x, z) - 0.2, ground(x, z) + 1.6, 0.05);
    }
    const ga = ground(ax, az) + 1.45;
    const gb = ground(bx, bz) + 1.45;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
    /* The bed is under three metres; the ropes take up the rest. */
    const end = Math.max(0.4, (len - 2.7) / 2);
    const stripes = k % 2 ? [[0.07, 0.1, 0.05], [0.1, 0.11, 0.06]] : [[0.11, 0.05, 0.03], [0.13, 0.08, 0.05]];
    const at = (a, b) => {
      const along = end + a * (len - 2 * end);
      const across = (b - 0.5) * 0.75 * Math.sin(Math.PI * (0.15 + 0.7 * a));
      const y = ga + (gb - ga) * (along / len) - 0.3 - 0.3 * Math.sin(Math.PI * a) - 0.12 * Math.sin(Math.PI * b) * Math.sin(Math.PI * a);
      return [ax + ux * along - uz * across, y, az + uz * along + ux * across];
    };
    for (let q = 0; q < 6; q += 1) {
      sheet(cloth, (a, b) => at((q + a) / 6, b), 2, 3, stripes[q % 2], [0.3, 0.3]);
    }
    for (const a of [0, 1]) {
      const e = at(a, 0.5);
      rope([a ? bx : ax, a ? gb : ga, a ? bz : az], e);
    }
  });
  /* THE LOOKOUT: a deck on four poles at the clearing's north edge, in a
   * tree's crown, and a ladder up to it. */
  {
    const L = CAMP_PROPS.lookout;
    const [x, z] = L.at;
    const g = ground(x, z);
    const top = g + L.deckY;
    const h = L.w / 2;
    for (const [ox, oz] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
      post(x + ox, z + oz, ground(x + ox, z + oz) - 0.2, top, 0.08);
    }
    box(solid, x, z, 1, 0, L.w + 0.2, L.w + 0.2, top, top + 0.12, WOOD, PLANKS, PLANKS);
    const deck = solidBox(colliders, 'obstacle', x, z, 1, 0, L.w + 0.2, L.w + 0.2, top, top + 0.12);
    const rec = recordAt({
      top: flatTop(-h - 0.1, -h - 0.1, h + 0.1, h + 0.1, 0), dy: 0.12, hw: h, hd: h, kind: 'platform',
    }, 'shingle:camp-lookout', x, top + 0.12, z, 0);
    rec.solids = [deck];
    rec.eaves = [deck];
    roofs.push(rec);
    for (const ox of [-0.25, 0.25]) {
      box(solid, x + ox, z + h + 0.6, 1, 0, 0.06, 0.06, g - 0.1, top, WOOD);
      colliders.addPost('pole', x + ox, z + h + 0.6, g - 0.1, top - 0.05, 0.05);
    }
    for (let y = g + 0.4; y < top - 0.1; y += 0.4) {
      box(solid, x, z + h + 0.6, 1, 0, 0.5, 0.04, y, y + 0.04, WOOD);
    }
    count += 2;
  }

  /* THE MAST: a light lattice of three legs round a pipe, a crossbar and
   * a small dish near the top, on its own group, which swings down about
   * its foot; three guy wires to stakes, slack when it is down. */
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.55, metalness: 0.6 });
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b2, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const M = CAMP_PROPS.mast;
  const [mx, mz] = M.at;
  const mg = ground(mx, mz);
  const mast = new THREE.Group();
  mast.name = 'interior-camp-mast';
  mast.position.set(mx, mg, mz);
  {
    const parts = [];
    const pipe = new THREE.CylinderGeometry(0.035, 0.05, M.h, 6);
    pipe.translate(0, M.h / 2, 0);
    parts.push(pipe);
    const R = 0.16;
    const leg = (k) => [Math.sin((k / 3) * Math.PI * 2) * R, Math.cos((k / 3) * Math.PI * 2) * R];
    const strut = (a, b, r) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const g = new THREE.CylinderGeometry(r, r, d.length(), 4, 1);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      parts.push(g);
    };
    for (let k = 0; k < 3; k += 1) {
      const [x, z] = leg(k);
      strut([x, 0, z], [x, M.h - 0.2, z], 0.018);
    }
    const STEP = 0.7;
    for (let y = 0, s = 0; y + STEP < M.h - 0.2; y += STEP, s += 1) {
      for (let k = 0; k < 3; k += 1) {
        const [x0, z0] = leg(k);
        const [x1, z1] = leg(k + 1);
        strut(s % 2 ? [x0, y, z0] : [x0, y + STEP, z0], s % 2 ? [x1, y + STEP, z1] : [x1, y, z1], 0.01);
      }
    }
    strut([0, M.h - 1.5, -0.03], [0, M.h - 1.5, -0.42], 0.02);
    const cross = new THREE.BoxGeometry(1.2, 0.04, 0.04);
    cross.translate(0, M.h - 0.4, 0);
    parts.push(cross);
    const lattice = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), mastMat);
    lattice.castShadow = true;
    lattice.name = 'interior-camp-mast';
    mast.add(lattice);
    /* The dish, a shallow bowl on a short arm, facing out of the camp. */
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 4, 0, Math.PI * 2, 0, 0.75).rotateX(Math.PI / 2).translate(0, 0, -0.36), dishMat);
    dish.position.set(0, M.h - 1.5, -0.45);
    dish.castShadow = true;
    dish.name = 'interior-camp-mast';
    mast.add(dish);
  }
  group.add(mast);
  const DISH_UP = M.h - 1.5;
  /* A capsule's add returns the set, not its index: the index is the
   * count before it. */
  const mastSolids = [colliders.ax.length, colliders.ax.length + 1];
  colliders.addPost('pole', mx, mz, mg - 0.2, mg + M.h - 0.1, 0.1);
  colliders.add('pole', mx - 0.6, mg + M.h - 0.4, mz, mx + 0.6, mg + M.h - 0.4, mz, 0.05);
  mastSolids.push(solidBox(colliders, 'obstacle', mx, mz - 0.45, 1, 0, 0.84, 0.5, mg + DISH_UP - 0.42, mg + DISH_UP + 0.42));
  count += 3;
  const guys = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const [sx, sz] = [mx + Math.sin(a) * 5, mz + Math.cos(a) * 5];
    guys.push(mx + Math.sin(a) * 0.16, mg + M.h - 2.2, mz + Math.cos(a) * 0.16, sx, ground(sx, sz) + 0.05, sz);
  }
  /* Ropes and wires a few millimetres thick are below the thermal
   * camera's resolution at any range it flies at. */
  const ropeMat = thermalHide(new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: 0.55 }));
  const guyGeo = new THREE.BufferGeometry();
  guyGeo.setAttribute('position', new THREE.Float32BufferAttribute(guys, 3));
  const guyLines = new THREE.LineSegments(guyGeo, ropeMat);
  guyLines.name = 'interior-camp-guys';
  group.add(guyLines);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3));
  const ropeLines = new THREE.LineSegments(ropeGeo, ropeMat);
  ropeLines.name = 'interior-camp-ropes';
  group.add(ropeLines);

  /* THE SMOKE: a thin column of soft puffs off the fire, each turned to
   * whichever camera draws it, rising, spreading, thinning and leaning
   * downwind. Lit, so it is dark by night; thin in the long wave band, so
   * the thermal picture sees through it (thermalHide). */
  const puffTex = texture(THREE, puffPixels(), PUFF_PX);
  const PUFFS = 12;
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  /* A puff faces the camera but is lit as if it faced the sun and the
   * sky between: smoke scatters the light that falls on it, it is not a
   * card shaded by the angle it is seen at. Its normal, the same for
   * every puff, is set in the camera's frame once a draw. */
  let sun;
  const sunDir = new THREE.Vector3();
  const sunAt = new THREE.Vector3();
  const facing = new THREE.Quaternion();
  const light = (scene, camera) => {
    if (sun === undefined) {
      sun = null;
      scene.traverse((o) => {
        if (!sun && o.isDirectionalLight) {
          sun = o;
        }
      });
    }
    if (sun) {
      sunDir.setFromMatrixPosition(sun.matrixWorld).sub(sunAt.setFromMatrixPosition(sun.target.matrixWorld)).normalize();
    } else {
      sunDir.set(0, 1, 0);
    }
    sunDir.y += 1;
    sunDir.normalize().applyQuaternion(facing.copy(camera.quaternion).invert());
    const n = puffGeo.attributes.normal;
    for (let i = 0; i < n.count; i += 1) {
      n.setXYZ(i, sunDir.x, sunDir.y, sunDir.z);
    }
    n.needsUpdate = true;
  };
  const puffs = [];
  for (let k = 0; k < PUFFS; k += 1) {
    const mat = thermalHide(new THREE.MeshLambertMaterial({
      color: 0x808287, map: puffTex, transparent: true, depthWrite: false, opacity: 0,
    }));
    const m = new THREE.Mesh(puffGeo, mat);
    m.name = 'interior-camp-smoke';
    m.renderOrder = 2;
    m.onBeforeRender = (renderer, scene, camera) => {
      m.quaternion.copy(camera.quaternion);
      m.updateMatrixWorld();
      if (k === 0) {
        light(scene, camera);
      }
    };
    puffs.push(m);
    group.add(m);
  }
  function update(seconds) {
    campLight.update(seconds);
    puffs.forEach((m, k) => {
      const t = (seconds * 0.05 + k / PUFFS + 0.03 * hash01(k, 0, 96)) % 1;
      const rise = 0.4 + t * 15;
      const lean = t ** 1.4 * 10;
      const wob = Math.sin(seconds * 0.4 + k * 1.7) * 0.8 * t;
      m.position.set(fx + lean * 0.8 + wob, fg + rise, fz - lean * 0.6 + wob * 0.5);
      m.scale.setScalar(1.1 + t * 5.5);
      m.material.opacity = 0.2 * (1 - t) ** 1.3 * Math.min(1, t * 10);
    });
  }
  update(0);

  /* THE WEAR on the clearing's floor: the paths the camp's people walk
   * (routes.js's camp loops) trodden dark into the soil, darker where
   * they cross, the ground under each roof scuffed and the ash round the
   * fire. A film of vertex alpha a few centimetres over the ground, seen
   * in shadow as the ground is; nothing a craft or the thermal picture
   * meets. */
  const wear = { pos: [], col: [] };
  const SOIL = [0.035, 0.022, 0.014];
  const wearAt = (x, z, a) => {
    wear.pos.push(x, ground(x, z) + 0.05, z);
    wear.col.push(SOIL[0], SOIL[1], SOIL[2], a);
  };
  const wearTri = (p, q, r) => {
    for (const [x, z, a] of [p, q, r]) {
      wearAt(x, z, a);
    }
  };
  /* A path wanders a little either side of the straight line between a
   * route's points, comes and goes in strength, and fades out at its
   * ends rather than stopping. */
  const PATH = 0.7;
  for (const [id, r] of Object.entries(ROUTES)) {
    if (!id.startsWith('camp-') || !id.endsWith('-loop')) {
      continue;
    }
    for (let k = 0; k + 1 < r.pts.length; k += 1) {
      const [a, b] = [r.pts[k], r.pts[k + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) {
        continue;
      }
      const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const n = Math.ceil(len);
      const seed = id.length * 7 + k;
      const row = (i) => {
        const t = i / n;
        const d = t * len;
        const off = 0.7 * Math.sin(d * 0.31 + seed) * Math.sin(Math.PI * t);
        const x = a[0] + (b[0] - a[0]) * t + nx * off;
        const z = a[1] + (b[1] - a[1]) * t + nz * off;
        const w = PATH * (0.75 + 0.5 * hash01(seed, i, 57));
        const ends = Math.min(1, d / 1.5, (len - d) / 1.5);
        const alpha = 0.26 * ends * (0.55 + 0.45 * hash01(seed, i >> 1, 59));
        return [[x - nx * w, z - nz * w, 0], [x, z, alpha], [x + nx * w, z + nz * w, 0]];
      };
      for (let i = 0; i < n; i += 1) {
        const [l0, c0, r0] = row(i);
        const [l1, c1, r1] = row(i + 1);
        wearTri(l0, c0, c1);
        wearTri(l0, c1, l1);
        wearTri(c0, r0, r1);
        wearTri(c0, r1, c1);
      }
    }
  }
  const scuff = (x, z, r, a) => {
    const seg = 14;
    for (let k = 0; k < seg; k += 1) {
      const t0 = (k / seg) * Math.PI * 2;
      const t1 = ((k + 1) / seg) * Math.PI * 2;
      const r0 = r * (0.8 + 0.4 * hash01(k, Math.round(x), 58));
      const r1 = r * (0.8 + 0.4 * hash01((k + 1) % seg, Math.round(x), 58));
      wearTri([x, z, a], [x + Math.sin(t1) * r1, z + Math.cos(t1) * r1, 0], [x + Math.sin(t0) * r0, z + Math.cos(t0) * r0, 0]);
    }
  };
  scuff(cmx, cmz, 11, 0.22);
  scuff(fx, fz, 2.4, 0.6);
  for (const f of Object.values(frames)) {
    scuff(f.cx, f.cz, 3.4, 0.28);
  }
  /* Where the dressing is worked at, trodden too; the cooking place's
   * ash. */
  for (const [at, r, a] of [[DRESSING.table.at, 2.2, 0.3], [DRESSING.cook.at, 1.6, 0.5], [DRESSING.tank.at, 1.8, 0.3], [DRESSING.generator.at, 1.2, 0.3], [DRESSING.wheelbarrow.at, 1.5, 0.2]]) {
    scuff(...campAt(at), r, a);
  }
  /* The motorcycles' tracks, a pair of ruts from each parked pair out to
   * the access path at the clearing's north west edge. */
  const TRACK = 0.12;
  for (const [from, bend] of [[[-20.5, 3.5], [-22, -12]], [[19.5, 4.5], [21, -19]]]) {
    const exit = [-15, -24];
    const at = (t) => [0, 1].map((i) => (1 - t) * (1 - t) * from[i] + 2 * (1 - t) * t * bend[i] + t * t * exit[i]);
    for (const side of [-0.32, 0.32]) {
      const n = 40;
      for (let i = 0; i < n; i += 1) {
        const [p0, p1] = [at(i / n), at((i + 1) / n)];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        const [nx, nz] = [-(p1[1] - p0[1]) / len, (p1[0] - p0[0]) / len];
        const a = 0.18 * Math.min(1, i / 4, (n - i) / 4) * (0.5 + 0.5 * hash01(i >> 1, side > 0 ? 1 : 0, 79));
        const q = (p, o, al) => {
          const [x, z] = campAt([p[0] + nx * (side + o), p[1] + nz * (side + o)]);
          return [x, z, al];
        };
        wearTri(q(p0, -TRACK, 0), q(p0, 0, a), q(p1, 0, a));
        wearTri(q(p0, -TRACK, 0), q(p1, 0, a), q(p1, -TRACK, 0));
        wearTri(q(p0, 0, a), q(p0, TRACK, 0), q(p1, TRACK, 0));
        wearTri(q(p0, 0, a), q(p1, TRACK, 0), q(p1, 0, a));
      }
    }
  }
  const wearGeo = new THREE.BufferGeometry();
  wearGeo.setAttribute('position', new THREE.Float32BufferAttribute(wear.pos, 3));
  wearGeo.setAttribute('color', new THREE.Float32BufferAttribute(wear.col, 4));
  wearGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(wear.pos.length).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const wearMat = thermalHide(new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  const wearMesh = new THREE.Mesh(wearGeo, wearMat);
  wearMesh.name = 'interior-camp-wear';
  wearMesh.receiveShadow = true;
  wearMesh.renderOrder = 1;
  group.add(wearMesh);

  const solidMat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: atlas, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
  });
  const clothMat = thermalKind(new THREE.MeshStandardMaterial({
    vertexColors: true, map: weave, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  }), 'vegetation');
  for (const fm of Object.values(flaps)) {
    fm.material = clothMat;
  }
  for (const m of [solidMat, clothMat, markMat, ...Object.values(plainMats)]) {
    campLight.patch(m);
  }
  const solidMesh = meshOf(THREE, solid, solidMat, 'interior-camp-solid');
  const clothMesh = meshOf(THREE, cloth, clothMat, 'interior-camp-cloth');
  group.add(solidMesh, clothMesh);

  let state = { mark: 'shelter-1', tarp: 0, mast: 0 };
  let mastRetired = false;
  function setCamp(next) {
    state = { ...state, ...next };
    for (const [id, pane] of Object.entries(markPanes)) {
      const s = CAMP_PROPS.shelters.find((x) => x.id === id);
      if (s.markable) {
        pane.material = id === state.mark ? markMat : plainMats[id];
      }
    }
    for (const [id, fm] of Object.entries(flaps)) {
      /* Only the marked shelter's side tarp hangs; it swings up and back
       * over the roof as it is pulled. */
      fm.visible = id === state.mark;
      fm.rotation.x = id === state.mark ? -state.tarp * 2.6 : 0;
    }
    const t = Math.max(0, Math.min(1, state.mast));
    mast.rotation.x = t * (Math.PI / 2);
    guyLines.visible = t <= 0.02;
    if (t > 0.02 && !mastRetired) {
      mastSolids.forEach((i) => colliders.retire(i));
      mastRetired = true;
    } else if (t <= 0.02 && mastRetired) {
      mastSolids.forEach((i) => colliders.restore(i));
      mastRetired = false;
    }
  }
  return {
    group,
    setCamp,
    update,
    state: () => ({ ...state }),
    frames,
    /* The clearing's fill and lamps (camplight.js), for the ground's and
     * the people's materials and the sun's irradiance. */
    light: campLight,
    stats: () => ({ solids: count }),
    dispose() {
      group.traverse((o) => {
        if (o.isMesh || o.isLineSegments) {
          o.geometry.dispose();
        }
      });
      for (const m of [markMat, fireMat, mastMat, dishMat, solidMat, clothMat, ropeMat, wearMat, ...puffs.map((p) => p.material), ...Object.values(plainMats)]) {
        m.dispose();
      }
      campLight.dispose();
      for (const t of [tex, atlas, weave, puffTex]) {
        t.dispose();
      }
      group.removeFromParent();
    },
  };
}
