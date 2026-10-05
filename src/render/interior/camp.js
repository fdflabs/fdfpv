/*
 * camp.js: the camp at Claro Viejo (TECH-NEEDS M1 assets, MISSIONS.md M1
 * stage 5): four shelters of poles and tarps, one tarp a person moves, the
 * Column's mark painted under one shelter's roof (mark.js), a mast that
 * comes down, a small solar panel on a stand, crates, water drums,
 * hammocks, the cooking fire, and the lookout's platform in a tree at the
 * clearing's north edge. Places from src/share/interior/places.js
 * CAMP_PROPS; the motorcycles are vehicles.js's, the people figures.js's.
 *
 * WHAT MOVES, on the room's word (map.setCamp): which of the three
 * markable shelters carries the mark (the dial), how far the side tarp
 * hiding its underside has been pulled back (0 hanging, 1 thrown up on
 * the roof), and how far the mast has come down (0 standing, 1 on the
 * ground). The mast's solid is retired the moment it starts down and
 * restored when it stands again (src/game/collide.js retire), so nothing
 * solid stands where nothing is drawn.
 *
 * SOLID AS DRAWN (interior:collide): every pole a post, each shelter's
 * roof a roof record on them, the platform a box and a roof, the crates,
 * the drums and the panel's stand boxes and posts. The tarps and the
 * hammocks are cloth: drawn, not walls.
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

import { CAMP_PROPS } from '../../share/interior/places.js';
import { recordAt, shedTop, flatTop } from '../../maps/alps/roofs.js';
import { thermalKind } from '../thermal.js';
import { markPixels, MARK_PX } from './mark.js';

const POLE = [0.2, 0.15, 0.1];
/* Patched, sun faded tarps: olive, grey, a washed blue, brown. */
const TARPS = [[0.07, 0.085, 0.04], [0.085, 0.085, 0.075], [0.045, 0.07, 0.1], [0.085, 0.065, 0.04]];
const WOOD = [0.17, 0.11, 0.06];
const DRUM = [0.12, 0.2, 0.32];
const STEEL = [0.3, 0.31, 0.32];
const yawOf = (dx, dz) => Math.atan2(dx, dz);

/* A growing merged mesh of triangles with normals and colours. */
function sink() {
  const pos = [];
  const nrm = [];
  const col = [];
  const uv = [];
  const out = {
    pos, nrm, col, uv,
    tri(a, b, c, colour, t = [[0, 0], [1, 0], [1, 1]]) {
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach((p, k) => {
        pos.push(p[0], p[1], p[2]);
        nrm.push(nx, ny, nz);
        col.push(colour[0], colour[1], colour[2]);
        uv.push(t[k][0], t[k][1]);
      });
    },
    quad(a, b, c, d, colour, two = false) {
      out.tri(a, b, c, colour, [[0, 0], [1, 0], [1, 1]]);
      out.tri(a, c, d, colour, [[0, 0], [1, 1], [0, 1]]);
      if (two) {
        out.tri(c, b, a, colour, [[1, 1], [1, 0], [0, 0]]);
        out.tri(d, c, a, colour, [[0, 1], [1, 1], [0, 0]]);
      }
    },
  };
  return out;
}

/* An upright box (centre x, z; long axis (dx, dz)) from y0 to y1. */
function box(s, cx, cz, dx, dz, w, d, y0, y1, colour) {
  const ax = dx * (w / 2); const az = dz * (w / 2);
  const bx = -dz * (d / 2); const bz = dx * (d / 2);
  const c = (y) => [[cx - ax - bx, y, cz - az - bz], [cx + ax - bx, y, cz + az - bz], [cx + ax + bx, y, cz + az + bz], [cx - ax + bx, y, cz - az + bz]];
  const lo = c(y0);
  const hi = c(y1);
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    s.quad(lo[k], lo[k2], hi[k2], hi[k], colour);
  }
  s.quad(hi[3], hi[2], hi[1], hi[0], colour);
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

/*
 * The camp: { group, setCamp({ mark, tarp, mast }), stats(), dispose() }.
 * Adds its colliders and roof records.
 */
export function buildCamp({
  THREE, world, colliders, roofs,
}) {
  const ground = world.groundAt;
  const group = new THREE.Group();
  group.name = 'interior-camp';
  const solid = sink();
  const cloth = sink();
  /* The mark is under the roof: its pane faces down and is drawn only
   * from below. */
  const markMat = thermalKind(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), 'vegetation');
  const tex = new THREE.DataTexture(markPixels(), MARK_PX, MARK_PX, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  markMat.map = tex;
  let count = 0;
  const post = (x, z, y0, y1, r) => {
    box(solid, x, z, 1, 0, r * 2, r * 2, y0, y1, POLE);
    colliders.addPost('pole', x, z, y0, y1 - r, r * 1.1);
    count += 1;
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
    const corners = [[-hu, hw, f.hi], [hu, hw, f.hi], [hu, -hw, f.lo], [-hu, -hw, f.lo]];
    for (const [u, w, top] of corners) {
      const [x, z] = f.at(u, w);
      post(x, z, ground(x, z) - 0.2, top, 0.05);
    }
    /* The tarp roof, out past the poles by a hand's breadth; its
     * underside a separate pane, the mark's where the dial says. */
    const r = corners.map(([u, w, top]) => {
      const [x, z] = f.at(u * 1.1, w * 1.12);
      return [x, top + 0.02, z];
    });
    cloth.quad(r[0], r[1], r[2], r[3], TARPS[k % TARPS.length]);
    const pane = sink();
    pane.quad(r[3], r[2], r[1], r[0], [1, 1, 1]);
    plainMats[s.id] = thermalKind(new THREE.MeshStandardMaterial({ color: new THREE.Color(...TARPS[k % TARPS.length]), roughness: 1 }), 'vegetation');
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
    /* The side tarp hanging off the high edge, hiding the roof's underside
     * from the open side until it is thrown back (setCamp tarp). */
    if (s.markable) {
      const flap = sink();
      flap.quad([-hu * 1.1, 0, 0], [hu * 1.1, 0, 0], [hu * 1.1, -1.5, 0], [-hu * 1.1, -1.5, 0], TARPS[(k + 1) % TARPS.length], true);
      const fm = meshOf(THREE, flap, null, `interior-camp-flap-${s.id}`);
      fm.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
      thermalKind(fm.material, 'vegetation');
      const [x, z] = f.at(0, hw * 1.12);
      fm.position.set(x, f.hi + 0.02, z);
      fm.rotation.y = yawOf(f.dx, f.dz) - Math.PI / 2;
      flaps[s.id] = fm;
      group.add(fm);
    }
  });

  /* THE SOLAR PANEL on its stand. */
  {
    const p = CAMP_PROPS.solar;
    const [x, z] = p.at;
    const g = ground(x, z);
    box(solid, x, z, 1, 0, 0.12, 0.12, g - 0.1, g + 0.9, STEEL);
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.14, 0.14, g - 0.1, g + 0.9);
    const [dx, dz] = p.dir;
    const a = [x - dz * 0.8 + dx * 0.0, g + 0.95, z + dx * 0.8];
    const b = [x + dz * 0.8, g + 0.95, z - dx * 0.8];
    const c = [b[0] - dx * 1.0, g + 1.45, b[2] - dz * 1.0];
    const d = [a[0] - dx * 1.0, g + 1.45, a[2] - dz * 1.0];
    solid.quad(a, b, c, d, [0.03, 0.04, 0.08], true);
    /* The panel's solid: the box it tilts inside, half a metre deep. */
    solidBox(colliders, 'obstacle', x - dx * 0.5, z - dz * 0.5, -dz, dx, 1.6, 1.0, g + 0.9, g + 1.5);
    count += 2;
  }
  /* CRATES, DRUMS, THE FIRE. */
  for (const [x, z] of CAMP_PROPS.crates) {
    const g = ground(x, z);
    box(solid, x, z, 1, 0, 0.9, 0.6, g - 0.05, g + 0.55, WOOD);
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.9, 0.6, g - 0.05, g + 0.55);
    count += 1;
  }
  for (const [x, z] of CAMP_PROPS.drums) {
    const g = ground(x, z);
    box(solid, x, z, 1, 0, 0.56, 0.56, g - 0.05, g + 0.9, DRUM);
    solidBox(colliders, 'obstacle', x, z, 1, 0, 0.56, 0.56, g - 0.05, g + 0.9);
    count += 1;
  }
  const fireMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0x3a1a08, roughness: 1 }), 'hot');
  {
    const [x, z] = CAMP_PROPS.fire.at;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10).rotateX(-Math.PI / 2), fireMat);
    disc.position.set(x, ground(x, z) + 0.05, z);
    disc.name = 'interior-camp-fire';
    group.add(disc);
  }
  /* HAMMOCKS, slung between two poles. */
  for (const h of CAMP_PROPS.hammocks) {
    const [ax, az] = h.from;
    const [bx, bz] = h.to;
    for (const [x, z] of [h.from, h.to]) {
      post(x, z, ground(x, z) - 0.2, ground(x, z) + 1.6, 0.05);
    }
    const ga = ground(ax, az) + 1.4;
    const gb = ground(bx, bz) + 1.4;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const my = (ga + gb) / 2 - 0.55;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * 0.4;
    const nz = ((bx - ax) / len) * 0.4;
    cloth.quad([ax, ga, az], [mx - nx, my, mz - nz], [mx + nx, my, mz + nz], [ax, ga, az], [0.5, 0.18, 0.12], true);
    cloth.quad([mx - nx, my, mz - nz], [bx, gb, bz], [bx, gb, bz], [mx + nx, my, mz + nz], [0.5, 0.18, 0.12], true);
  }
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
    box(solid, x, z, 1, 0, L.w + 0.2, L.w + 0.2, top, top + 0.12, WOOD);
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
    count += 2;
  }

  /* THE MAST: a pole on its own mesh, which swings down about its foot. */
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.6, metalness: 0.6 });
  const M = CAMP_PROPS.mast;
  const mastGeo = new THREE.CylinderGeometry(0.04, 0.07, M.h, 6);
  mastGeo.translate(0, M.h / 2, 0);
  const cross = new THREE.BoxGeometry(1.2, 0.04, 0.04);
  cross.translate(0, M.h - 0.4, 0);
  const mast = new THREE.Group();
  mast.name = 'interior-camp-mast';
  const [mx, mz] = M.at;
  mast.position.set(mx, ground(mx, mz), mz);
  mast.add(new THREE.Mesh(mastGeo, mastMat), new THREE.Mesh(cross, mastMat));
  for (const c of mast.children) {
    c.castShadow = true;
    c.name = 'interior-camp-mast';
  }
  group.add(mast);
  const mg = ground(mx, mz);
  /* A capsule's add returns the set, not its index: the index is the
   * count before it. */
  const mastSolids = [colliders.ax.length, colliders.ax.length + 1];
  colliders.addPost('pole', mx, mz, mg - 0.2, mg + M.h - 0.1, 0.1);
  colliders.add('pole', mx - 0.6, mg + M.h - 0.4, mz, mx + 0.6, mg + M.h - 0.4, mz, 0.05);
  count += 2;

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const clothMat = thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 'vegetation');
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
    state: () => ({ ...state }),
    frames,
    stats: () => ({ solids: count }),
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
      for (const m of [markMat, fireMat, mastMat, solidMat, clothMat, ...Object.values(plainMats)]) {
        m.dispose();
      }
      tex.dispose();
      group.removeFromParent();
    },
  };
}
