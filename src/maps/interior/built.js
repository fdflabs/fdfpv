/*
 * built.js: what places.js put on the Interior's land, drawn, solid and
 * landable: the roads, Río Sereno and its streams, Puente Doble, the
 * causeway on Arroyo Manso, the colonia's houses, chapel, school and
 * store, Sector Alpha's silos and sheds, and Pista Cero's container and
 * tent. Their yards (fences, tanks, washing, motorcycles, the pitch, a
 * farm's machines) are yards.js's.
 *
 * WHAT A COLONIA LOOKS LIKE from a drone's 120 m and through the camera
 * ball's 8x: low houses of lime plaster in pale colours or bare brick,
 * under red clay tile or corrugated tin, new and grey or gone to rust,
 * hipped or with two slopes and a gable; a veranda along the front under
 * the same roof, on posts; a door, shuttered windows; an outbuilding
 * behind, a lean to of rusted tin. A chapel with a bell gable over its
 * door, a school with its corridor. The choices are seeded by each
 * building's id (sink.js seeded), the same on every load.
 *
 * DRAWN CHEAPLY. One merged mesh per material per site (the colonia,
 * the crossing, the bridge, Sector Alpha, Pista Cero), so a site off
 * screen is culled whole and the corridor is a few dozen draws; the
 * roads and the water are ribbons.js's, a mesh each. The skins (skins.js)
 * are a few small textures made at load.
 *
 * SOLID AS DRAWN (interior:collide). A building's walls are one turned box
 * under its eaves (src/game/collide.js addTurnedBox) and its roof a roof
 * record (src/render/library/roofs.js), so a craft lands on the roof it sees
 * and the walls under it pass while it stands there (rec.solids); a
 * gable or a lean to's high side is a stack of thin boxes, each inside
 * the drawn wall and under the roof. A veranda's roof is the house's,
 * over posts. The bridge's deck is a roof record over a solid slab and
 * its girders, its piers posts and a cap, its rails boxes; its approach
 * embankments roof records of earth. An open shed's roof stands on posts
 * with nothing under it. The water is the plant's channel (rivers), not
 * a solid.
 *
 * THERMAL. Walls, tile and concrete declare nothing and are built
 * surfaces (src/render/thermal.js); tin's emissivity falls with its
 * metalness, so the galvanised sheet (0.75) reads the cold sky it
 * reflects and the rusted one (0.3) is nearer its own temperature.
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

import {
  BRIDGES, BUILDINGS, CROSSINGS, PLACES, ROADS, nearestOnLine,
} from '../../share/interior/places.js';
import {
  recordAt, gableTop, shedTop, flatTop, pyramidTop,
} from '../../render/library/roofs.js';
import { thermalHide, thermalKind } from '../../render/thermal.js';
import { buildRoads, buildWater } from './ribbons.js';
import {
  makeSink, meshOf, frameOf, corners, boxInto, drumInto, faceQuad, solidBox, seeded,
} from './sink.js';
import { makeSkins, PERIOD, MEAN } from './skins.js';
import { clearance, dressYards } from './yards.js';

const srgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
};
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const scale = (a, k) => a.map((x) => x * k);

/* Linear colours. A grey skin's material is lifted by 1 / MEAN where it
 * is written (lift), so the colour named is the colour seen. */
const lift = (c) => c.map((x) => Math.min(1, x / MEAN));
const CONCRETE = [0.36, 0.35, 0.32];
const BRIDGE_FACE = [0.5, 0.49, 0.45];
const RAIL = [0.72, 0.72, 0.69];
const DECK = [0.2, 0.19, 0.18];
const RED_EARTH = [0.2, 0.07, 0.03];
const ROAD_EARTH = [0.3, 0.1, 0.04];
const BANK = [0.13, 0.08, 0.035];
const UNDER = [0.07, 0.06, 0.05];
const POST_WOOD = [0.16, 0.1, 0.06];
const GLASS = [0.018, 0.022, 0.026];
const TILE = [[0.33, 0.1, 0.045], [0.27, 0.085, 0.04], [0.38, 0.13, 0.06], [0.22, 0.08, 0.045]];
const TIN = [0.42, 0.43, 0.42];
const BRICK = [[0.3, 0.11, 0.055], [0.26, 0.1, 0.05]];
/* Doors and shutters, painted: wood, a blue, a green, a sky blue. */
const PAINT = [[0.11, 0.055, 0.028], [0.02, 0.07, 0.17], [0.03, 0.1, 0.05], [0.12, 0.27, 0.4], [0.3, 0.3, 0.28]];
/* The overhang of an eave past the walls, m. */
const OVER = 0.5;
/* A gable's or a lean to's fill is stacked in bands this tall, m: a
 * drawn point is never further than this under the roof or beside a
 * band. */
const BAND = 0.2;

/* Four slopes in roofs.js's convention (x across, z along, the plate at
 * y 0): a ridge along z at height r, the ends sloping down to the eaves
 * like the sides, so nothing under it is a wall above the plate. */
function hipTop(hw, hd, r) {
  const k = Math.max(0, hd - hw);
  return [
    [[-hw, 0, -hd], [-hw, 0, hd], [0, r, k], [0, r, -k]],
    [[hw, 0, hd], [hw, 0, -hd], [0, r, -k], [0, r, k]],
    [[-hw, 0, hd], [hw, 0, hd], [0, r, k]],
    [[hw, 0, -hd], [-hw, 0, -hd], [0, r, -k]],
  ];
}

/* A turn about y, as roofs.js frameElements takes it: local +z along
 * (dx, dz), local +x along (dz, -dx), so a building frame's v (across,
 * toward (-dz, dx)) is roofs.js's -x. */
const yawOf = (dx, dz) => Math.atan2(dx, dz);

/* The colonia's road, which every house faces. */
const COLONIA_ROAD = ROADS.find((r) => r.id === 'colonia-road').points;

/*
 * How a dwelling is built, chosen from its id: the roof's shape and
 * skin, its pitch (tile steeper than tin), its walls (the colour places.js
 * gave it, or bare brick), the veranda's depth.
 */
function styleOf(b) {
  const r = seeded(b.id, 1);
  if (b.kind === 'school') {
    return {
      roof: 'hip', skin: 'tin', ridge: 1.5, veranda: 2.4, dado: 1.0, dadoCol: [0.03, 0.09, 0.26], wall: srgb(b.colour), paint: PAINT[1],
    };
  }
  if (b.kind === 'store') {
    return {
      roof: 'shed', skin: 'rust', ridge: 0.9, veranda: 0, dado: 0.5, wall: srgb(b.colour), paint: PAINT[3],
    };
  }
  const brick = seeded(b.id, 2) < 0.22;
  const wall = brick ? BRICK[Math.floor(seeded(b.id, 3) * BRICK.length)] : srgb(b.colour);
  const paint = PAINT[Math.floor(seeded(b.id, 4) * PAINT.length)];
  const base = {
    wall, paint, dado: 0.45, veranda: seeded(b.id, 5) < 0.75 ? 2.0 : 0,
  };
  if (r < 0.4) {
    return { ...base, roof: seeded(b.id, 6) < 0.6 ? 'hip' : 'gable', skin: 'tile', ridge: 1.9 };
  }
  if (r < 0.72) {
    return { ...base, roof: seeded(b.id, 6) < 0.7 ? 'gable' : 'hip', skin: 'tin', ridge: 1.1 };
  }
  return { ...base, roof: 'gable', skin: 'rust', ridge: 1.0 };
}

/*
 * The built parts: { group, rivers (the plant's channels), view(camera),
 * update(step), stats(), dispose() }. Adds its colliders to `colliders`
 * and its roof records to `roofs`.
 */
export async function buildBuilt({
  THREE, scene, world, colliders, roofs,
}) {
  const group = new THREE.Group();
  group.name = 'interior-built';
  scene.add(group);
  const ground = world.groundAt;
  const skins = makeSkins(THREE);
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });

  /* THE MATERIALS: what each draws, its skin's period and the mesh name
   * scripts/interior-collide.js knows a solid by. `detail` meshes are
   * hidden past DETAIL_M (view below): sub pixel there. */
  const MATS = {
    walls: { name: 'interior-walls', mat: std({ map: skins.plaster, roughness: 0.92 }), period: PERIOD.plaster },
    tile: { name: 'interior-roofs', mat: std({ map: skins.tile, roughness: 0.78 }), period: PERIOD.tile },
    tin: { name: 'interior-roofs', mat: std({ map: skins.tin, roughness: 0.68, metalness: 0.75 }), period: PERIOD.tin },
    rust: { name: 'interior-roofs', mat: std({ map: skins.rust, roughness: 0.8, metalness: 0.3 }), period: PERIOD.rust },
    concrete: { name: 'interior-concrete', mat: std({ map: skins.plaster, roughness: 0.85 }), period: PERIOD.plaster },
    kit: { name: 'interior-walls', mat: std({ roughness: 0.6, metalness: 0.1 }), detail: true },
    deck: {
      name: 'interior-deck', mat: std({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), shadow: false,
    },
    props: { name: 'interior-props', mat: std({ side: THREE.DoubleSide }), detail: true },
    marks: {
      name: 'interior-marks',
      mat: thermalHide(std({ roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })),
      detail: true,
      shadow: false,
    },
    leaves: { name: 'interior-yard-trees', mat: thermalKind(std({ roughness: 0.85, side: THREE.DoubleSide }), 'vegetation'), detail: true },
  };

  const bridgeMid = (b) => [(b.from[0] + b.to[0]) / 2, (b.from[1] + b.to[1]) / 2];
  const SITES = {
    colonia: PLACES.coloniaArroyoManso.at,
    crossing: CROSSINGS[0].at,
    bridge: bridgeMid(BRIDGES[0]),
    alpha: BUILDINGS.find((b) => b.id === 'alpha-silo').at,
    pista: BUILDINGS.find((b) => b.id === 'pista-container').at,
  };
  const siteOf = (x, z) => {
    let best = 'colonia';
    let bd = Infinity;
    for (const [k, [sx, sz]] of Object.entries(SITES)) {
      const d = (x - sx) ** 2 + (z - sz) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };
  const sinks = new Map();
  const sink = (x, z, type) => {
    const key = `${siteOf(x, z)}|${type}`;
    if (!sinks.has(key)) {
      sinks.set(key, makeSink(MATS[type].period));
    }
    return sinks.get(key);
  };
  let solidCount = 0;
  /* Every building's footprint as it is stood, for where its yard's
   * things may go (yards.js clearance). */
  const footprints = [];
  const room = clearance(footprints);
  const box = (x, z, dx, dz, w, d, y0, y1) => {
    solidCount += 1;
    return solidBox(colliders, 'wall', x, z, dx, dz, w, d, y0, y1);
  };
  const post = (x, z, y0, y1, r) => {
    solidCount += 1;
    colliders.addPost('pole', x, z, y0, y1, r);
  };

  /* A roof's faces drawn: each top face wound to face up in `skinSink`,
   * its underside dark under it. */
  const drawTop = (top, toWorld, skinSink, colour) => {
    for (const face of top) {
      let w = face.map(toWorld);
      const ux = w[1][0] - w[0][0];
      const uz = w[1][2] - w[0][2];
      const vx = w[2][0] - w[0][0];
      const vz = w[2][2] - w[0][2];
      if (uz * vx - ux * vz < 0) {
        w = w.slice().reverse();
      }
      for (let k = 1; k + 1 < w.length; k += 1) {
        skinSink.tri(w[0], w[k], w[k + 1], colour);
        skinSink.tri(w[k + 1], w[k], w[0], UNDER);
      }
    }
  };

  /*
   * A building: walls, roof, a veranda, its doors and windows, its
   * solids and its roof record. `spec`: { id, kind, cx, cz, dx, dz, w,
   * d, h, roof, skin, ridge, wall, dado, dadoCol, paint, veranda, front
   * (+1 or -1: the side of the frame's v the veranda and the door face),
   * windows (along a long wall, m apart) }. Returns { g, eaves, frame }.
   */
  function standBuilding(spec) {
    const {
      id, cx, cz, dx, dz, w, d, h, roof, skin, ridge, wall, front,
    } = spec;
    const F = frameOf(cx, cz, dx, dz);
    const foot = corners(cx, cz, dx, dz, w, d, 0);
    const g = Math.min(...foot.map(([x, , z]) => ground(x, z)));
    const eaves = g + h;
    const walls = sink(cx, cz, 'walls');
    footprints.push({
      cx, cz, dx, dz, w, d,
    });
    const vd = spec.veranda || 0;
    /* The walls' box, the veranda's depth off its front. */
    const wd = d - vd;
    const wv = -front * (vd / 2);
    const [wx, , wz] = F.at(0, wv, 0);
    const wallCol = lift(wall);
    const dadoTop = g + (spec.dado ?? 0.45);
    const dadoCol = lift(spec.dadoCol ?? mix(wall, RED_EARTH, 0.55));
    boxInto(walls, wx, wz, dx, dz, w, wd, g - 0.4, dadoTop, dadoCol, false);
    boxInto(walls, wx, wz, dx, dz, w, wd, dadoTop, eaves, wallCol, false);
    const solids = [box(wx, wz, dx, dz, w, wd, g - 0.4, eaves - 0.05)];

    /* Doors and windows, on the walls' faces. */
    const paint = lift(spec.paint);
    const glass = lift(GLASS);
    /* A quad on one of the walls' four faces, t along the face from its
     * middle: the front and back faces run along u, the ends across. */
    const onFace = (side, t, hw, y0, y1, colour) => {
      let p;
      let n;
      if (side === 'front' || side === 'back') {
        const f = side === 'front' ? front : -front;
        p = F.at(t, wv + f * (wd / 2 + 0.03), 0);
        n = [-dz * f, dx * f];
      } else {
        const e = side === 'end+' ? 1 : -1;
        p = F.at(e * (w / 2 + 0.03), wv + t, 0);
        n = [dx * e, dz * e];
      }
      faceQuad(walls, p[0], p[2], n[0], n[1], hw, y0, y1, colour);
    };
    /* A window: its glass and a shutter folded back each side. */
    const window = (side, t) => {
      onFace(side, t, 0.5, g + 0.95, g + 1.95, glass);
      onFace(side, t - 0.78, 0.26, g + 0.92, g + 1.98, paint);
      onFace(side, t + 0.78, 0.26, g + 0.92, g + 1.98, paint);
    };
    if (spec.openings) {
      const doorAt = (seeded(id, 7) - 0.5) * w * 0.3;
      onFace('front', doorAt, spec.kind === 'store' ? 1.3 : 0.48, g + 0.02, g + 2.1, spec.kind === 'store' ? glass : paint);
      const step = spec.windows ?? 2.8;
      for (let a = -w / 2 + 1.4; a <= w / 2 - 1.3; a += step) {
        if (Math.abs(a - doorAt) > 1.6) {
          window('front', a);
        }
        if (seeded(id, 8 + Math.round(a)) < 0.6 || spec.kind === 'school') {
          window('back', a);
        }
      }
      if (wd > 4) {
        window('end+', 0);
        window('end-', 0);
      }
    }
    if (spec.sign) {
      onFace('front', 0, w / 2 - 0.4, eaves - 0.75, eaves - 0.15, spec.sign);
    }

    /* The veranda: posts along its front, a slab under it. */
    if (vd > 0) {
      const n = Math.max(2, Math.round(w / 3) + 1);
      for (let k = 0; k < n; k += 1) {
        const u = -w / 2 + 0.12 + ((w - 0.24) * k) / (n - 1);
        const [px, , pz] = F.at(u, front * (d / 2 - 0.12), 0);
        boxInto(walls, px, pz, dx, dz, 0.14, 0.14, g - 0.1, eaves, lift(spec.kind === 'school' ? wall : [0.55, 0.53, 0.5]), false);
        post(px, pz, g - 0.1, eaves - 0.1, 0.08);
      }
      const [sx, , sz] = F.at(0, front * (d / 2 - vd / 2), 0);
      boxInto(sink(cx, cz, 'concrete'), sx, sz, dx, dz, w, vd, g - 0.3, g + 0.12, lift(CONCRETE));
      solids.push(box(sx, sz, dx, dz, w, vd, g - 0.3, g + 0.12));
    }

    /* The roof, roofs.js's frame: x across (our -v), z along (our u). */
    const hw = d / 2 + OVER;
    const hd = w / 2 + OVER;
    let top;
    /* Its height over the plate across the building, for the fill. */
    let profile = null;
    if (roof === 'hip') {
      top = hipTop(hw, hd, ridge);
    } else if (roof === 'gable') {
      top = gableTop(hw, 0, ridge, -hd, hd);
      profile = (v) => ridge * (1 - Math.abs(v) / hw);
    } else if (roof === 'shed') {
      /* High along the front. */
      top = shedTop(-front * hw, ridge, front * hw, 0, -hd, hd);
      profile = (v) => (ridge * (hw + front * v)) / (2 * hw);
    } else {
      top = flatTop(-d / 2, -w / 2, d / 2, w / 2, 0);
    }
    const ry = yawOf(dx, dz);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const toWorld = ([lx, ly, lz]) => [c * lx + s * lz + cx, eaves + ly, -s * lx + c * lz + cz];
    const roofSink = sink(cx, cz, skin === 'flat' ? 'walls' : skin);
    const roofCol = spec.roofCol ?? (skin === 'tile' ? lift(TILE[Math.floor(seeded(id, 9) * TILE.length)])
      : skin === 'tin' ? lift(scale(TIN, 0.85 + 0.15 * seeded(id, 9))) : skin === 'rust' ? scale([1, 1, 1], 0.8 + 0.2 * seeded(id, 9)) : wallCol);
    drawTop(top, toWorld, roofSink, roofCol);
    if (skin === 'tile' && roof !== 'flat') {
      /* The ridge's capping tiles. */
      const k = roof === 'hip' ? Math.max(0, hd - hw) : hd;
      const cap = scale(roofCol, 0.8);
      const r0 = toWorld([0, ridge + 0.1, -k]);
      const r1 = toWorld([0, ridge + 0.1, k]);
      for (const e of [-1, 1]) {
        const a0 = toWorld([e * 0.16, ridge - 0.06, -k]);
        const a1 = toWorld([e * 0.16, ridge - 0.06, k]);
        drawTop([[a0, a1, r1, r0]], (p) => p, roofSink, cap);
      }
    }
    /* The gable ends and a lean to's high side: drawn walls, and stacks
     * of thin solids inside them under the roof. */
    if (profile && !spec.open) {
      const pv = (v) => Math.max(0, profile(v));
      for (const e of [-1, 1]) {
        const u = e * (w / 2);
        const pts = [[-d / 2, 0], [d / 2, 0], [d / 2, pv(d / 2)]];
        if (roof === 'gable') {
          pts.push([0, ridge]);
        }
        pts.push([-d / 2, pv(-d / 2)]);
        const wp = pts.map(([v, y]) => F.at(u, v, eaves + y));
        for (let k = 1; k + 1 < wp.length; k += 1) {
          walls.tri(wp[0], wp[k], wp[k + 1], wallCol);
          walls.tri(wp[k + 1], wp[k], wp[0], wallCol);
        }
        for (let y0 = 0; y0 < ridge - 1e-6; y0 += BAND) {
          const y1 = Math.min(ridge, y0 + BAND);
          let lo = Infinity;
          let hi = -Infinity;
          for (let v = -d / 2; v <= d / 2 + 1e-9; v += 0.05) {
            if (pv(v) >= y1) {
              lo = Math.min(lo, v);
              hi = Math.max(hi, v);
            }
          }
          if (!(hi - lo > 0.1)) {
            continue;
          }
          const [bx, , bz] = F.at(e * (w / 2 - 0.1), (lo + hi) / 2, 0);
          solids.push(box(bx, bz, dx, dz, 0.2, hi - lo, eaves + y0, eaves + y1));
        }
      }
      if (roof === 'shed') {
        const vh = front * (d / 2);
        const yh = pv(vh);
        const q = [F.at(-w / 2, vh, eaves), F.at(w / 2, vh, eaves), F.at(w / 2, vh, eaves + yh), F.at(-w / 2, vh, eaves + yh)];
        walls.quad(q[0], q[1], q[2], q[3], wallCol);
        walls.quad(q[3], q[2], q[1], q[0], wallCol);
        const [bx, , bz] = F.at(0, vh - front * 0.1, 0);
        solids.push(box(bx, bz, dx, dz, w, 0.2, eaves, eaves + pv(vh - front * 0.2)));
      }
    }
    const key = `${skin === 'tile' ? 'tile' : spec.kind === 'container' ? 'metal' : 'tin'}:${id}`;
    const rec = recordAt({
      top, dy: 0.15, hw, hd, open: !!spec.open, kind: spec.kind,
    }, key, cx, eaves, cz, ry);
    rec.solids = solids;
    rec.eaves = solids;
    roofs.push(rec);
    return { g, eaves, frame: F };
  }

  /* A grain silo: a ribbed drum, a cone, a ladder up its side. */
  function standSilo(id, cx, cz, r, h, ridge) {
    const n = 24;
    const g = ground(cx, cz) - 0.2;
    const eaves = g + h;
    const tin = sink(cx, cz, 'tin');
    const shade = lift(scale(TIN, 0.92));
    drumInto(tin, cx, cz, r, g - 0.5, eaves, n, shade, { top: false, swap: true });
    drawTop(pyramidTop(n, r, 0, ridge), ([x, y, z]) => [cx + x, eaves + y, cz + z], tin, lift(TIN));
    /* The drum as strips inscribed in its circle, half a metre wide,
     * along x and along z: their union is never outside the drawn wall
     * and never more than 0.21 m inside it (measured on 14 sides; 24
     * are closer). The cone is a roof record over it, so a craft lands
     * on it. */
    const posts = [];
    for (const along of [[1, 0], [0, 1]]) {
      for (let z0 = -r; z0 < r - 1e-9; z0 += 0.5) {
        const z1 = Math.min(r, z0 + 0.5);
        const zm = Math.max(Math.abs(z0), Math.abs(z1));
        const half = Math.sqrt(Math.max(0, r * r - zm * zm));
        if (half < 0.05) {
          continue;
        }
        const mid = (z0 + z1) / 2;
        posts.push(box(cx - along[1] * mid, cz + along[0] * mid, along[0], along[1], 2 * half, z1 - z0, g - 1, eaves));
      }
    }
    /* The ladder, on the drum's south face, and its solid. */
    const kit = sink(cx, cz, 'kit');
    const lz = cz + r + 0.08;
    for (const side of [-0.22, 0.22]) {
      boxInto(kit, cx + side, lz, 1, 0, 0.05, 0.05, g + 0.3, eaves, [0.25, 0.26, 0.26]);
    }
    for (let y = g + 0.6; y < eaves; y += 0.35) {
      boxInto(kit, cx, lz, 1, 0, 0.44, 0.04, y, y + 0.04, [0.25, 0.26, 0.26]);
    }
    posts.push(box(cx, cz + r + 0.02, 1, 0, 0.5, 0.2, g + 0.3, eaves));
    const rec = recordAt({
      top: pyramidTop(n, r, 0, ridge), dy: 0.2, hw: r, hd: r, kind: 'silo',
    }, `metal:${id}`, cx, eaves, cz, 0);
    rec.solids = posts;
    rec.eaves = posts;
    roofs.push(rec);
    return { g, eaves };
  }

  /* An open shed: a roof on steel posts every five metres or so along
   * its long sides, a concrete floor, nothing else under it. */
  function standOpenShed(b) {
    const [cx, cz] = b.at;
    const [dx, dz] = b.dir;
    const foot = corners(cx, cz, dx, dz, b.w, b.d, 0);
    const g = Math.min(...foot.map(([x, , z]) => ground(x, z)));
    const eaves = g + b.h;
    const F = frameOf(cx, cz, dx, dz);
    const walls = sink(cx, cz, 'walls');
    const n = Math.ceil(b.w / 5) + 1;
    for (const v of [-0.48, 0.48]) {
      for (let k = 0; k < n; k += 1) {
        const u = -b.w * 0.48 + (b.w * 0.96 * k) / (n - 1);
        const [px, , pz] = F.at(u, v * b.d, 0);
        boxInto(walls, px, pz, dx, dz, 0.25, 0.25, g - 0.3, eaves, lift([0.25, 0.26, 0.26]));
        post(px, pz, g - 0.3, eaves - 0.1, 0.15);
      }
    }
    boxInto(sink(cx, cz, 'concrete'), cx, cz, dx, dz, b.w, b.d, g - 0.5, g + 0.12, lift(CONCRETE));
    box(cx, cz, dx, dz, b.w, b.d, g - 0.5, g + 0.12);
    const hw = b.d / 2 + OVER;
    const hd = b.w / 2 + OVER;
    const top = b.roof === 'gable' ? gableTop(hw, 0, b.ridge, -hd, hd) : shedTop(-hw, b.ridge, hw, 0, -hd, hd);
    const ry = yawOf(dx, dz);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const toWorld = ([lx, ly, lz]) => [c * lx + s * lz + cx, eaves + ly, -s * lx + c * lz + cz];
    const skin = seeded(b.id, 1) < 0.5 ? 'tin' : 'rust';
    drawTop(top, toWorld, sink(cx, cz, skin), skin === 'tin' ? lift(scale(TIN, 0.9)) : [0.9, 0.9, 0.9]);
    const rec = recordAt({
      top, dy: 0.15, hw, hd, open: true, kind: b.kind,
    }, `tin:${b.id}`, cx, eaves, cz, ry);
    rec.solids = [];
    rec.eaves = [];
    roofs.push(rec);
  }

  /* THE BRIDGE: a deck on two girders, two spans on a pier of two
   * columns and a cap mid river, an abutment each end, posts and two
   * rails painted white both sides, an embankment of red earth carrying
   * the road up to each end. */
  const decks = [];
  for (const b of BRIDGES) {
    const [ax, az] = b.from;
    const [bx, bz] = b.to;
    const [dx, dz] = b.dir;
    const len = Math.hypot(bx - ax, bz - az);
    const [cx, cz] = bridgeMid(b);
    const F = frameOf(cx, cz, dx, dz);
    const top = b.deckY;
    const bot = top - b.deckThick;
    const conc = sink(cx, cz, 'concrete');
    boxInto(conc, cx, cz, dx, dz, len, b.width, bot, top, lift(BRIDGE_FACE));
    const solids = [box(cx, cz, dx, dz, len, b.width, bot, top)];
    /* The girders, under the deck's two lanes. */
    const girder = 0.9;
    for (const side of [-1, 1]) {
      const [gx, , gz] = F.at(0, side * (b.width / 2 - 1.6), 0);
      boxInto(conc, gx, gz, dx, dz, len, 0.6, bot - girder, bot, lift(CONCRETE));
      solids.push(box(gx, gz, dx, dz, len, 0.6, bot - girder, bot));
    }
    /* The rails: a curb, posts every two metres, two rails; their solid
     * is the parapet's whole box, which they fill to within a hand. */
    for (const side of [-1, 1]) {
      const v = side * (b.width / 2 - 0.15);
      const [rx, , rz] = F.at(0, v, 0);
      boxInto(conc, rx, rz, dx, dz, len, 0.3, top, top + 0.2, lift(CONCRETE));
      boxInto(conc, rx, rz, dx, dz, len, 0.3, top + b.rail - 0.18, top + b.rail, lift(RAIL));
      boxInto(conc, rx, rz, dx, dz, len, 0.26, top + 0.42, top + 0.56, lift(RAIL));
      for (let u = -len / 2; u <= len / 2 + 1e-6; u += len / Math.round(len / 2)) {
        const [px, , pz] = F.at(Math.max(-len / 2 + 0.11, Math.min(len / 2 - 0.11, u)), v, 0);
        boxInto(conc, px, pz, dx, dz, 0.22, 0.3, top + 0.2, top + b.rail - 0.18, lift(RAIL), false);
      }
      solids.push(box(rx, rz, dx, dz, len, 0.3, top, top + b.rail));
    }
    /* The pier: two columns on the river's bed and a cap under the
     * girders. The abutments: a wall each end down into the bank. */
    {
      const [px, , pz] = F.at(0, 0, 0);
      const capTop = bot - girder;
      const capBot = capTop - 0.8;
      boxInto(conc, px, pz, dx, dz, 1.3, b.width - 0.4, capBot, capTop, lift(CONCRETE));
      solids.push(box(px, pz, dx, dz, 1.3, b.width - 0.4, capBot, capTop));
      for (const side of [-1, 1]) {
        const [qx, , qz] = F.at(0, side * 2.2, 0);
        const gq = Math.min(ground(qx, qz), capBot) - 2;
        drumInto(conc, qx, qz, 0.55, gq, capBot, 12, lift(CONCRETE), { top: false });
        post(qx, qz, gq, capBot, 0.5);
      }
    }
    for (const f of [0, 1]) {
      const px = ax + (bx - ax) * f;
      const pz = az + (bz - az) * f;
      const g = ground(px, pz);
      boxInto(conc, px, pz, dx, dz, 2.4, b.width - 0.6, Math.min(g, bot) - 2, bot, lift(CONCRETE), false);
      solids.push(box(px, pz, dx, dz, 2.4, b.width - 0.6, Math.min(g, bot) - 2, bot));
    }
    const rec = recordAt({
      top: flatTop(-b.width / 2, -len / 2, b.width / 2, len / 2, 0), dy: b.deckThick, hw: b.width / 2, hd: len / 2, kind: 'bridge',
    }, 'concrete:bridge', cx, top, cz, yawOf(dx, dz));
    rec.material = 'rock';
    rec.solids = solids;
    rec.eaves = [];
    roofs.push(rec);
    /* The deck's surface. */
    const dk = corners(cx, cz, dx, dz, len, b.width - 0.6, top + 0.02);
    sink(cx, cz, 'deck').quad(dk[3], dk[2], dk[1], dk[0], DECK);
    /* The embankments: from each end outward until the ground comes up
     * to within a hand of the road, the top falling gently to meet it,
     * the sides at one in one and a half. */
    const reach = [0, 0];
    for (const [end, out] of [[0, -1], [1, 1]]) {
      const ex = end ? bx : ax;
      const ez = end ? bz : az;
      const hwTop = b.width / 2 + 0.5;
      let L = 6;
      while (L < 45) {
        const gx = ground(ex + dx * out * L, ez + dz * out * L);
        if (gx >= top - 0.04 * L - 0.15) {
          break;
        }
        L += 3;
      }
      const gEnd = ground(ex + dx * out * L, ez + dz * out * L);
      const topAt = (sAlong) => top + (Math.min(top, gEnd + 0.05) - top) * (sAlong / L);
      const sections = [];
      for (let sAlong = 0; sAlong <= L + 1e-6; sAlong += 3) {
        const mx = ex + dx * out * sAlong;
        const mz = ez + dz * out * sAlong;
        const y = topAt(sAlong);
        const sec = {};
        for (const side of [-1, 1]) {
          const nx = -dz * side;
          const nz = dx * side;
          const tx = mx + nx * hwTop;
          const tz = mz + nz * hwTop;
          let reachOut = hwTop + 1.5 * Math.max(0, y - ground(tx, tz));
          reachOut = hwTop + 1.5 * Math.max(0, y - ground(mx + nx * reachOut, mz + nz * reachOut));
          const toeX = mx + nx * reachOut;
          const toeZ = mz + nz * reachOut;
          sec[side] = { top: [tx, y, tz], toe: [toeX, Math.min(y, ground(toeX, toeZ)) - 0.05, toeZ] };
        }
        sections.push(sec);
      }
      const earth = sink(ex, ez, 'concrete');
      const faces = [];
      const ox = ex;
      const oy = top;
      const oz = ez;
      const local = (p) => [p[0] - ox, p[1] - oy, p[2] - oz];
      const add = (a, bq, cq, colour) => {
        /* Wound to face up, and recorded as ground. */
        const ux = bq[0] - a[0];
        const uz = bq[2] - a[2];
        const vx = cq[0] - a[0];
        const vz = cq[2] - a[2];
        const tri = uz * vx - ux * vz < 0 ? [a, cq, bq] : [a, bq, cq];
        earth.tri(tri[0], tri[1], tri[2], colour);
        faces.push(tri.map(local));
      };
      for (let k = 0; k + 1 < sections.length; k += 1) {
        const p = sections[k];
        const q = sections[k + 1];
        add(p[-1].top, p[1].top, q[1].top, lift(ROAD_EARTH));
        add(p[-1].top, q[1].top, q[-1].top, lift(ROAD_EARTH));
        for (const side of [-1, 1]) {
          add(p[side].top, p[side].toe, q[side].toe, lift(BANK));
          add(p[side].top, q[side].toe, q[side].top, lift(BANK));
        }
      }
      let ext = 0;
      for (const f of faces) {
        for (const [lx, , lz] of f) {
          ext = Math.max(ext, Math.abs(lx), Math.abs(lz));
        }
      }
      const erec = recordAt({
        top: faces, dy: 0.5, hw: ext, hd: ext, kind: 'embankment',
      }, `earth:${b.id}-${end}`, ox, oy, oz, 0);
      erec.material = 'rock';
      erec.solids = [];
      erec.eaves = [];
      roofs.push(erec);
      reach[end] = L;
    }
    decks.push({
      b, cx, cz, len, reach,
    });
  }
  /* Where the road ribbon is not drawn: on the deck and up the
   * embankments, which draw their own. */
  const onDeck = (x, z) => decks.some(({
    b, cx, cz, len, reach,
  }) => {
    const u = (x - cx) * b.dir[0] + (z - cz) * b.dir[1];
    const v = -(x - cx) * b.dir[1] + (z - cz) * b.dir[0];
    return u > -len / 2 - reach[0] - 1 && u < len / 2 + reach[1] + 1 && Math.abs(v) < b.width / 2 + 2;
  });

  /* THE ROADS, on the ground, not drawn across the bridge. */
  const roads = buildRoads({ THREE, ground, skip: onDeck });
  for (const c of CROSSINGS) {
    const [dx, dz] = c.dir;
    const y = ground(c.at[0], c.at[1]) + 0.3;
    boxInto(sink(c.at[0], c.at[1], 'concrete'), c.at[0], c.at[1], dx, dz, c.length, c.width, y - 0.8, y, lift(CONCRETE));
    const slab = box(c.at[0], c.at[1], dx, dz, c.length, c.width, y - 0.8, y);
    const rec = recordAt({
      top: flatTop(-c.width / 2, -c.length / 2, c.width / 2, c.length / 2, 0), dy: 0.8, hw: c.width / 2, hd: c.length / 2, kind: 'causeway',
    }, `concrete:${c.id}`, c.at[0], y, c.at[1], yawOf(dx, dz));
    rec.material = 'rock';
    rec.solids = [slab];
    rec.eaves = [];
    roofs.push(rec);
  }

  /* RIO SERENO and its streams. */
  const water = buildWater({ THREE, ground });

  /* THE BUILDINGS. */
  const dwellings = [];
  for (const b of BUILDINGS) {
    const [cx, cz] = b.at;
    const [dx, dz] = b.dir;
    if (b.kind === 'silo') {
      standSilo(b.id, cx, cz, b.w / 2, b.h, b.ridge);
      /* A second, smaller bin beside it and the elevator's leg between. */
      standSilo(`${b.id}-2`, cx + 10, cz, 2.8, b.h - 2.5, b.ridge * 0.8);
      const tx = cx + 5;
      const tz = cz - 4.2;
      const gt = ground(tx, tz) - 0.2;
      const leg = sink(tx, tz, 'walls');
      boxInto(leg, tx, tz, 1, 0, 1.2, 1.2, gt - 0.3, gt + b.h + 4, lift([0.3, 0.31, 0.31]));
      boxInto(leg, tx, tz, 1, 0, 2.0, 1.5, gt + b.h + 4, gt + b.h + 5.2, lift([0.36, 0.37, 0.37]));
      box(tx, tz, 1, 0, 1.2, 1.2, gt - 0.3, gt + b.h + 4);
      box(tx, tz, 1, 0, 2.0, 1.5, gt + b.h + 4, gt + b.h + 5.2);
      continue;
    }
    if (b.kind === 'openshed') {
      standOpenShed(b);
      continue;
    }
    if (b.kind === 'house' || b.kind === 'school' || b.kind === 'store') {
      const style = styleOf(b);
      const near = nearestOnLine(COLONIA_ROAD, cx, cz);
      const front = Math.sign(-dz * (near.x - cx) + dx * (near.z - cz)) || 1;
      const placed = standBuilding({
        ...style,
        id: b.id,
        kind: b.kind,
        cx,
        cz,
        dx,
        dz,
        w: b.w,
        d: b.d,
        h: b.h,
        front,
        windows: b.kind === 'school' ? 3 : 2.8,
        openings: true,
        sign: b.kind === 'store' ? lift([0.45, 0.06, 0.03]) : null,
      });
      dwellings.push({
        b, front, style, ...placed,
      });
      continue;
    }
    /* Pista Cero's container and tent, as they were. */
    standBuilding({
      id: b.id,
      kind: b.kind,
      cx,
      cz,
      dx,
      dz,
      w: b.w,
      d: b.d,
      h: b.h,
      roof: b.roof === 'flat' ? 'flat' : 'hip',
      skin: b.roof === 'flat' ? 'flat' : 'kit',
      roofCol: srgb(b.colour),
      ridge: b.ridge,
      wall: srgb(b.colour),
      dado: 0.3,
      dadoCol: srgb(b.colour),
      paint: [0.05, 0.05, 0.05],
      front: 1,
    });
  }

  /* Outbuildings: a lean to of rusted tin behind most houses. */
  for (const h of dwellings) {
    if (h.b.kind !== 'house' || seeded(h.b.id, 20) > 0.65) {
      continue;
    }
    const { b, front } = h;
    const [dx, dz] = b.dir;
    const u = (seeded(b.id, 21) - 0.5) * b.w * 0.5;
    const [ox, , oz] = h.frame.at(u, -front * (b.d / 2 + 5.3), 0);
    if (!room.ok(ox, oz, 8, 3)) {
      continue;
    }
    standBuilding({
      id: `${b.id}-shed`,
      kind: 'outbuilding',
      cx: ox,
      cz: oz,
      dx,
      dz,
      w: 3.2,
      d: 2.6,
      h: 2.1,
      roof: 'shed',
      skin: 'rust',
      ridge: 0.5,
      wall: seeded(b.id, 22) < 0.5 ? BRICK[0] : mix(h.style.wall, [0.3, 0.3, 0.28], 0.4),
      paint: PAINT[0],
      front,
      windows: 9,
      openings: true,
    });
  }

  /* The chapel, north of the road in the middle of the colonia, its
   * door and bell gable to the road. */
  {
    const [x0, z0] = SITES.colonia;
    const near = nearestOnLine(COLONIA_ROAD, x0 - 10, z0 - 14);
    const [rdx, rdz] = near.dir;
    /* North of an eastward road: the road's right normal. */
    const nx = rdz;
    const nz = -rdx;
    const cx = near.x + nx * 36;
    const cz = near.z + nz * 36;
    const dx = -nx;
    const dz = -nz;
    const w = 13;
    const d = 7;
    const placed = standBuilding({
      id: 'colonia-chapel',
      kind: 'chapel',
      cx,
      cz,
      dx,
      dz,
      w,
      d,
      h: 4.2,
      roof: 'gable',
      skin: 'tile',
      ridge: 2.6,
      wall: [0.78, 0.76, 0.7],
      dado: 0.6,
      dadoCol: [0.1, 0.2, 0.4],
      paint: PAINT[0],
      front: 1,
    });
    const { g, eaves, frame: F } = placed;
    const walls = sink(cx, cz, 'walls');
    /* The door in the front gable end, the windows down its sides. */
    const [fx, , fz] = F.at(w / 2 + 0.03, 0, 0);
    faceQuad(walls, fx, fz, dx, dz, 0.85, g + 0.02, g + 2.7, lift(PAINT[0]));
    for (const side of [-1, 1]) {
      for (const u of [-3.6, 0, 3.6]) {
        const [qx, , qz] = F.at(u, side * (d / 2 + 0.03), 0);
        faceQuad(walls, qx, qz, -dz * side, dx * side, 0.3, g + 1.4, g + 3.2, lift(GLASS));
      }
    }
    /* The bell gable: a wall over the front gable with an opening for
     * the bell, and the cross on it. */
    const bt = eaves + 2.6 + 1.6;
    const [bx, , bz] = F.at(w / 2 - 0.25, 0, 0);
    boxInto(walls, bx, bz, dx, dz, 0.5, 2.6, eaves, bt, lift([0.78, 0.76, 0.7]));
    box(bx, bz, dx, dz, 0.5, 2.6, eaves, bt);
    for (const e of [1, -1]) {
      const [ox, , oz] = F.at(w / 2 - 0.25 + e * 0.27, 0, 0);
      faceQuad(walls, ox, oz, dx * e, dz * e, 0.42, bt - 1.45, bt - 0.35, lift(UNDER));
    }
    const kit = sink(cx, cz, 'kit');
    boxInto(kit, bx, bz, dx, dz, 0.1, 0.1, bt, bt + 1.0, [0.5, 0.5, 0.48]);
    boxInto(kit, bx, bz, dx, dz, 0.1, 0.6, bt + 0.6, bt + 0.7, [0.5, 0.5, 0.48]);
    box(bx, bz, dx, dz, 0.14, 0.14, bt, bt + 1.0);
  }

  /* THE YARDS: fences, tanks, washing, motorcycles, trees, the pitch,
   * Sector Alpha's machines. */
  const yards = dressYards({
    THREE, world, sink, dwellings, footprints, box, post,
  });

  const meshes = [];
  for (const [key, s] of sinks) {
    if (!s.pos.length) {
      continue;
    }
    const [site, type] = key.split('|');
    const def = MATS[type];
    const m = meshOf(THREE, s, def.mat, def.name);
    m.userData.site = site;
    m.userData.detail = !!def.detail;
    if (def.shadow === false) {
      m.castShadow = false;
    }
    group.add(m);
    meshes.push(m);
  }
  const ribbons = [roads.mesh, ...water.meshes];
  for (const m of ribbons) {
    group.add(m);
  }
  const tris = meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0) + roads.triangles + water.triangles;
  /* Past this a yard's dressing is under a pixel at High: hidden. */
  const DETAIL_M = 2200;
  return {
    group,
    rivers: water.rivers,
    view(camera) {
      for (const m of meshes) {
        if (m.userData.detail) {
          const sph = m.geometry.boundingSphere;
          m.visible = camera.position.distanceTo(sph.center) - sph.radius < DETAIL_M;
        }
      }
    },
    update() {},
    stats: () => ({
      meshes: meshes.length + ribbons.length, triangles: tris, solids: solidCount, roofs: roofs.length, ...yards.stats(),
    }),
    dispose() {
      for (const m of [...meshes, ...ribbons]) {
        m.geometry.dispose();
      }
      for (const def of Object.values(MATS)) {
        def.mat.dispose();
      }
      for (const m of ribbons) {
        m.material.dispose();
      }
      for (const t of Object.values(skins)) {
        t.dispose();
      }
      group.removeFromParent();
    },
  };
}
