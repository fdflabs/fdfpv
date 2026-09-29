/*
 * attackers.js: the war mode's attackers, drawn (docs/WARFARE-PLAN.md
 * sections 3 and 5.2). src/share/roomwar.js says where every live one is
 * at a room millisecond; this puts a model there.
 *
 * ONE INSTANCED MESH PER KIND. Each kind's model is built once from boxes,
 * cylinders and extruded outlines, its parts' colours baked into a vertex
 * colour attribute and merged into one geometry under one cel material,
 * so a kind is one draw call however many fly: sixty attackers are at
 * most seven calls (the budget is 300 a view, ITAIPU-PLAN section 13), and
 * a kind with none alive draws nothing. No outline hulls, which would
 * double that. The props are still discs, the blur a real one shows.
 *
 * The models are generic and unmarked on purpose (section 3: the enemy
 * is never named): no insignia, no national markings, no serials. Sizes
 * are the plan's: a 3 m twin boom pusher scout, a 1.2 m X wing tube
 * loitering munition, a 2.5 m pusher delta, 0.25 m quads (the hunter in
 * another paint), a 5 m speedboat and a mast on a raft. Each is built in
 * the scene body frame (src/render/frame.js: nose -z, top +y, metres) with
 * its centre at the origin, which is the point the room's pose and the
 * blast are measured from; a boat's origin is its waterline.
 *
 * A DEATH is a flash and the airframe's own pieces through the crash
 * debris (src/render/debris.js emit, surface -1: a part leaving with
 * nothing under it); a defender's warhead is a bigger flash where it went
 * off. Flashes are a small pool of additive sprites on the wall clock.
 *
 * Render only: nothing here reaches a plant or the room.
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
import { celMaterial } from './celmat.js';
import { KINDS } from '../share/war/routes.js';

/* Instances a kind starts with; it doubles when a wave needs more. */
const START_CAPACITY = 16;
const FLASHES = 16;

/* One part of a model: a geometry placed in the body frame, one colour. */
function part(geo, color, { at = [0, 0, 0], rot = [0, 0, 0] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) {
    geo.dispose();
  }
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  ));
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/* A cylinder along the body's z (fore and aft). */
const tubeZ = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
/* A disc facing along z: a prop turning about the fore and aft axis. */
const discZ = (r) => new THREE.CylinderGeometry(r, r, 0.006, 18).rotateX(Math.PI / 2);
/* A disc facing up: a quad's prop. */
const discY = (r) => new THREE.CylinderGeometry(r, r, 0.004, 16);
/* A cone along -z, its base at z = 0. */
const noseZ = (r, len, seg = 10) => new THREE.ConeGeometry(r, len, seg).rotateX(-Math.PI / 2).translate(0, 0, -len / 2);

/* A flat outline in the body's x and z (z aft), extruded `thick` in y and
 * centred on y = 0. */
function slab(points, thick) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  /* The shape's y was -z; a quarter turn about x takes it back to z. */
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thick / 2, 0);
  return g;
}

const PAINT = {
  scout: { body: 0xb4b9bf, dark: 0x2a2d31, prop: 0x3a3d42, lens: 0x16181b },
  loiter: { body: 0x5c6844, dark: 0x30362a, prop: 0x2a2d31, lens: 0x16181b },
  strike: { body: 0x4b5057, dark: 0x33373c, prop: 0x25282c, lens: 0x16181b },
  fpv: { body: 0x1d1e21, arm: 0x2b2c30, prop: 0x3b3d42, motor: 0x8c9096, load: 0x6a6b3c },
  hunter: { body: 0x1d1e21, arm: 0xd2541e, prop: 0xe8742e, motor: 0x8c9096, load: 0x9a2a1c },
  boat: { hull: 0x3c4146, deck: 0x5a6066, dark: 0x25282c, motor: 0x1e2023 },
  jammer: { deck: 0x6b5b3e, drum: 0x2b2f33, mast: 0x8a8f94, whip: 0xd0d4d7, box: 0x4a573a },
};

function scout(c) {
  const parts = [
    part(tubeZ(0.13, 1.2), c.body, { at: [0, 0, 0.05] }),
    part(noseZ(0.13, 0.35), c.body, { at: [0, 0, -0.55] }),
    part(new THREE.SphereGeometry(0.07, 10, 8), c.lens, { at: [0, -0.1, -0.5] }),
    /* A high straight wing, 3 m. */
    part(box(3.0, 0.04, 0.3), c.body, { at: [0, 0.1, -0.05] }),
    /* Twin booms to an H tail, the pusher between them. */
    part(tubeZ(0.028, 1.35), c.body, { at: [-0.45, 0.08, 0.6] }),
    part(tubeZ(0.028, 1.35), c.body, { at: [0.45, 0.08, 0.6] }),
    part(box(0.96, 0.025, 0.2), c.body, { at: [0, 0.1, 1.2] }),
    part(box(0.025, 0.28, 0.22), c.body, { at: [-0.45, 0.22, 1.2] }),
    part(box(0.025, 0.28, 0.22), c.body, { at: [0.45, 0.22, 1.2] }),
    part(discZ(0.3), c.prop, { at: [0, 0, 0.68] }),
    part(tubeZ(0.05, 0.08), c.dark, { at: [0, 0, 0.64] }),
  ];
  return parts;
}

function loiter(c) {
  const wing = (span, chord, z, roll) => part(box(span, 0.012, chord), c.body, { at: [0, 0, z], rot: [0, 0, roll] });
  return [
    part(tubeZ(0.07, 1.0), c.body, { at: [0, 0, 0.05] }),
    part(noseZ(0.07, 0.15), c.dark, { at: [0, 0, -0.45] }),
    part(new THREE.SphereGeometry(0.035, 8, 6), c.lens, { at: [0, -0.03, -0.5] }),
    /* The X: two crossed wings fore, a smaller pair aft. */
    wing(0.62, 0.13, -0.18, Math.PI / 4),
    wing(0.62, 0.13, -0.18, -Math.PI / 4),
    wing(0.46, 0.1, 0.42, Math.PI / 4),
    wing(0.46, 0.1, 0.42, -Math.PI / 4),
    part(discZ(0.14), c.prop, { at: [0, 0, 0.58] }),
  ];
}

function strike(c) {
  return [
    /* The delta, 2.5 m across, its root 2.6 m. */
    part(slab([[0, -1.35], [1.25, 0.95], [1.05, 1.15], [-1.05, 1.15], [-1.25, 0.95]], 0.07), c.body),
    part(box(0.34, 0.22, 2.1), c.dark, { at: [0, 0.1, 0.05] }),
    part(noseZ(0.14, 0.4, 8), c.dark, { at: [0, 0.08, -1.0] }),
    part(box(0.03, 0.34, 0.36), c.body, { at: [-1.12, 0.17, 0.95] }),
    part(box(0.03, 0.34, 0.36), c.body, { at: [1.12, 0.17, 0.95] }),
    part(tubeZ(0.12, 0.3), c.dark, { at: [0, 0.1, 1.2] }),
    part(discZ(0.38), c.prop, { at: [0, 0.1, 1.38] }),
  ];
}

function quad(c) {
  const arm = (yaw) => part(box(0.018, 0.008, 0.25), c.arm, { rot: [0, yaw, 0] });
  const out = [
    part(box(0.05, 0.03, 0.11), c.body, { at: [0, 0.012, 0] }),
    arm(Math.PI / 4),
    arm(-Math.PI / 4),
    part(box(0.03, 0.025, 0.02), c.body, { at: [0, 0.018, -0.06] }),
    /* The warhead, slung under. */
    part(tubeZ(0.022, 0.15), c.load, { at: [0, -0.024, 0.005] }),
    part(noseZ(0.022, 0.03, 8), c.load, { at: [0, -0.024, -0.07] }),
  ];
  const r = 0.125 * Math.SQRT1_2;
  for (const [x, z] of [[r, r], [-r, r], [r, -r], [-r, -r]]) {
    out.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 8), c.motor, { at: [x, 0.012, z] }));
    out.push(part(discY(0.058), c.prop, { at: [x, 0.024, z] }));
  }
  return out;
}

function boat(c) {
  /* A low 5 m hull, the bow a point, 1.5 m of beam. */
  const deck = [[0, -2.5], [0.55, -1.7], [0.75, -0.8], [0.75, 2.5], [-0.75, 2.5], [-0.75, -0.8], [-0.55, -1.7]];
  const keel = [[0, -2.3], [0.35, -1.6], [0.45, -0.8], [0.45, 2.45], [-0.45, 2.45], [-0.45, -0.8], [-0.35, -1.6]];
  return [
    part(slab(deck, 0.3), c.hull, { at: [0, 0.2, 0] }),
    part(slab(keel, 0.3), c.dark, { at: [0, -0.08, 0] }),
    part(slab(deck.map(([x, z]) => [x * 0.86, z * 0.9 + 0.1]), 0.04), c.deck, { at: [0, 0.37, 0] }),
    part(box(0.7, 0.35, 0.5), c.deck, { at: [0, 0.55, 0.4] }),
    part(box(0.72, 0.28, 0.06), c.dark, { at: [0, 0.8, 0.14], rot: [-0.6, 0, 0] }),
    /* The outboard on the transom. */
    part(box(0.3, 0.5, 0.35), c.motor, { at: [0, 0.35, 2.62] }),
    part(box(0.1, 0.5, 0.12), c.motor, { at: [0, -0.15, 2.66] }),
  ];
}

function jammer(c) {
  const out = [
    part(box(2.4, 0.12, 2.4), c.deck, { at: [0, 0.22, 0] }),
    part(box(0.6, 0.45, 0.4), c.box, { at: [0.5, 0.5, 0.5] }),
    part(new THREE.CylinderGeometry(0.05, 0.07, 4.0, 8), c.mast, { at: [0, 2.28, 0] }),
    part(box(1.3, 0.05, 0.05), c.mast, { at: [0, 3.9, 0] }),
    part(box(0.5, 0.5, 0.06), c.whip, { at: [0, 3.0, -0.08] }),
  ];
  for (const x of [-0.8, 0.8]) {
    out.push(part(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10).rotateX(Math.PI / 2), c.drum, { at: [x, 0.02, 0] }));
  }
  for (const x of [-0.62, 0.62]) {
    out.push(part(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5), c.whip, { at: [x, 4.45, 0] }));
  }
  return out;
}

const BUILD = {
  scout, loiter, strike, fpv: quad, hunter: quad, boat, jammer,
};

/* What each kind sheds when it breaks (debris.js SHED, by material), how
 * big its flash is, metres, and how hard its pieces are thrown, m/s. */
const DEATH = {
  scout: { shed: 'epo', flash: 6, speed: 15, emits: 3, spread: 1.2 },
  loiter: { shed: 'cf-tube', flash: 7, speed: 28, emits: 2, spread: 0.5 },
  strike: { shed: 'epo', flash: 9, speed: 38, emits: 3, spread: 1.0 },
  fpv: { shed: 'cf-plate', flash: 4, speed: 30, emits: 1, spread: 0 },
  hunter: { shed: 'cf-plate', flash: 4, speed: 36, emits: 1, spread: 0 },
  boat: { shed: 'ply', flash: 8, speed: 14, emits: 3, spread: 2.0 },
  jammer: { shed: 'ply', flash: 7, speed: 10, emits: 2, spread: 1.0 },
};
/* A defender's warhead, and an attacker that reached its target. */
const BOOM_FLASH = 12;
const IMPACT_FLASH = 16;

/* The kind's model: one merged geometry, its colours in vertices. */
export function attackerGeometry(kind) {
  const g = mergeGeometries(BUILD[kind](PAINT[kind]), false);
  g.computeBoundingSphere();
  return g;
}

function glowTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const r = Math.hypot((x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1);
      const a = r >= 1 ? 0 : (1 - r) ** 1.6;
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/*
 * The attackers' layer. `debris` is the shell's createDebris() (or null),
 * `floorAt(x, z)` the ground's height, for where the pieces come to rest.
 * Returns { group, update(list, dtS), dead(event), boom(p), drawn(),
 * clear(), dispose() }: update with roomwar's attackersAt list once a
 * frame; dead with each 'dead' event of roomwar's takeEvents, and boom
 * with each 'boom'.
 */
export function createAttackers({ debris = null, floorAt = () => -Infinity } = {}) {
  const group = new THREE.Group();
  group.name = 'attackers';
  const mat = celMaterial({ color: 0xffffff });
  mat.vertexColors = true;
  const meshes = new Map();
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  function meshFor(kind, need) {
    let mesh = meshes.get(kind);
    if (mesh && mesh.instanceMatrix.count >= need) {
      return mesh;
    }
    let cap = mesh ? mesh.instanceMatrix.count : START_CAPACITY;
    while (cap < need) {
      cap *= 2;
    }
    const geo = mesh ? mesh.geometry : attackerGeometry(kind);
    if (mesh) {
      group.remove(mesh);
      mesh.dispose();
    }
    mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = `attackers-${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* The instances are kilometres apart and the geometry's own sphere is
     * a metre round the origin: culling on it would hide them all. */
    mesh.frustumCulled = false;
    mesh.count = 0;
    meshes.set(kind, mesh);
    group.add(mesh);
    return mesh;
  }

  const glow = glowTexture();
  const flashes = [];
  for (let i = 0; i < FLASHES; i += 1) {
    const m = new THREE.SpriteMaterial({
      map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.renderOrder = 4;
    group.add(s);
    flashes.push({ s, age: 0, life: 0, size: 0 });
  }
  const hot = new THREE.Color(0xfff4d6);
  const fire = new THREE.Color(0xff7a2a);
  let nextFlash = 0;

  function flash(p, size, life = 0.7) {
    const f = flashes[nextFlash];
    nextFlash = (nextFlash + 1) % FLASHES;
    f.s.position.set(p[0], p[1], p[2]);
    f.age = 0;
    f.life = life;
    f.size = size;
    f.s.visible = true;
  }

  let drawnList = [];

  return {
    group,

    /* list: [{ id, kind, p, q }] (roomwar attackersAt); dtS the frame's
     * seconds, for the flashes. */
    update(list, dtS) {
      const by = new Map(KINDS.map((k) => [k, []]));
      for (const a of list) {
        by.get(a.kind).push(a);
      }
      for (const [kind, xs] of by) {
        if (!xs.length && !meshes.has(kind)) {
          continue;
        }
        const mesh = meshFor(kind, xs.length);
        for (let i = 0; i < xs.length; i += 1) {
          const a = xs[i];
          m4.compose(pos.set(a.p[0], a.p[1], a.p[2]), rot.set(a.q[0], a.q[1], a.q[2], a.q[3]), one);
          mesh.setMatrixAt(i, m4);
        }
        mesh.count = xs.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
      drawnList = list;
      for (const f of flashes) {
        if (!f.s.visible) {
          continue;
        }
        f.age += dtS;
        const u = f.age / f.life;
        if (u >= 1) {
          f.s.visible = false;
          continue;
        }
        /* Up to full size in the first fifth, then white to fire as it
         * fades. */
        const grow = Math.min(1, u * 5);
        f.s.scale.setScalar(f.size * (0.4 + 0.6 * grow));
        f.s.material.color.copy(hot).lerp(fire, Math.min(1, u * 1.6));
        f.s.material.opacity = 1 - u * u;
      }
    },

    /* A roomwar 'dead' event: each attacker's burst where it was, and the
     * impact's when it reached a target. One that flew away ('leave')
     * just goes. */
    dead(ev) {
      if (ev.why === 'leave') {
        return;
      }
      for (const a of ev.agents) {
        const d = DEATH[a.kind];
        flash(a.p, d.flash);
        if (!debris) {
          continue;
        }
        const floorY = floorAt(a.p[0], a.p[2]);
        for (let i = 0; i < d.emits; i += 1) {
          const k = i - (d.emits - 1) / 2;
          const at = new THREE.Vector3(a.p[0] + k * d.spread, a.p[1], a.p[2] - k * d.spread * 0.5);
          debris.emit(at, new THREE.Vector3(0, 1, 0), d.speed, -1, d.shed, floorY, 'break');
        }
      }
      if (ev.why === 'arrive' && ev.hit && ev.p) {
        flash(ev.p, IMPACT_FLASH, 1.4);
      }
    },

    /* A defender's warhead went off at p. */
    boom(p) {
      flash(p, BOOM_FLASH, 0.9);
    },

    /* What was drawn last, for the checks: the list and each kind's
     * instance count. */
    drawn() {
      return {
        list: drawnList,
        counts: Object.fromEntries([...meshes].map(([k, m]) => [k, m.count])),
        calls: [...meshes.values()].filter((m) => m.count > 0).length,
      };
    },

    clear() {
      for (const mesh of meshes.values()) {
        mesh.count = 0;
      }
      for (const f of flashes) {
        f.s.visible = false;
      }
      drawnList = [];
    },

    dispose() {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      meshes.clear();
      for (const f of flashes) {
        f.s.material.dispose();
      }
      glow.dispose();
      mat.dispose();
      group.clear();
    },
  };
}
