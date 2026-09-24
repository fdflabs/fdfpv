/*
 * nature.js: what grows and flows in the valley.
 *
 * The lake with its shore, the stream from the hanging valley to the
 * lake with its fall and its pool, the forests of spruce, larch and
 * beech, the boulders under the cliffs, the flowers in the pasture and
 * the old snow in the hollows. Everything repeated is instanced and cut
 * into bands along the valley so the half behind the camera is culled.
 * Everything reads the terrain through ctx.heightAt and places nothing
 * the village or the road needs to know about.
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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from '../../render/celmat.js';
import { noise2, smoothstep } from './noise.js';
import { ribbon } from './ribbon.js';
import {
  FIELD, HALF, STRIP_L, STRIP_W, LAKE_Z, LAKE_Y, LAKE_END, SIDE_Z, LIP_DX, POOL,
  TREE_LINE, SNOW_LINE, streamX, treeLine, forestDensity,
} from './terrain.js';

/* Colliders and the fine detail stop here: further out the hillside is
 * the first thing a wing hits. */
const COLLIDE_R = 700;

/* The valley is cut into this many bands along z; every instanced thing
 * is one mesh per band, so the bands behind the camera cull. */
const BANDS = 4;
const bandOf = (z) => Math.max(0, Math.min(BANDS - 1, Math.floor((z + HALF) / (FIELD / BANDS))));

/* Every geometry that is merged into a tree carries its own colour, so a
 * whole species is one material and one draw call a band. */
function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let k = 0; k < n; k += 1) {
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function trunk(r0, r1, h, hex, sides = 5) {
  const g = new THREE.CylinderGeometry(r0, r1, h, sides, 1, true);
  g.translate(0, h / 2, 0);
  return tinted(g, hex);
}

/* A whorl of a conifer: a cone with its base at y, turned a little so
 * the facets of one tier do not line up with the next. Seven sides, so
 * a tier is never seen edge on. */
function tier(y, r, h, turn, hex) {
  const g = new THREE.ConeGeometry(r, h, 7, 1);
  g.rotateY(turn);
  g.translate(0, y + h / 2, 0);
  return tinted(g, hex);
}

/* A canopy blob with smooth normals, so it shades as one round mass with
 * a curved band edge rather than as a crumple of facets. */
function blob(r, detail, x, y, z, hex) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g = mergeVertices(g);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return tinted(g, hex);
}

const merge = (parts) => mergeGeometries(parts, false);

/*
 * THE SPECIES, each authored at the origin on flat ground, a tree of a
 * nominal height that the instance scales. Spruce: a dark tree of four
 * close tiers over a short bare trunk, sixteen metres, and a squat
 * three tier one. Larch: taller, thinner, lighter and looser, the trunk
 * showing between the tiers. Beech: a trunk and a crown of four blobs.
 */
function spruceTall() {
  return merge([
    trunk(0.2, 0.42, 4.2, 0x3f2d20),
    tier(2.4, 3.0, 5.4, 0.0, 0x223d20),
    tier(6.0, 2.4, 4.8, 0.4, 0x284826),
    tier(9.3, 1.75, 4.2, 0.9, 0x2e532b),
    tier(12.2, 1.1, 3.8, 0.2, 0x355e31),
  ]);
}
function spruceSquat() {
  return merge([
    trunk(0.2, 0.4, 3.2, 0x3f2d20),
    tier(1.8, 2.7, 4.6, 0.3, 0x223d20),
    tier(5.0, 2.1, 4.2, 0.8, 0x2a4b27),
    tier(8.0, 1.35, 4.0, 0.1, 0x33592f),
  ]);
}
function larch() {
  return merge([
    trunk(0.16, 0.34, 15.5, 0x7a5a3a),
    tier(3.4, 2.2, 2.7, 0.2, 0x6a973a),
    tier(6.5, 1.9, 2.6, 0.7, 0x72a140),
    tier(9.4, 1.5, 2.5, 0.1, 0x7aab45),
    tier(12.1, 1.0, 2.9, 0.5, 0x84b64c),
  ]);
}
function beech() {
  return merge([
    trunk(0.3, 0.46, 4.4, 0x5b4230, 6),
    blob(2.9, 1, 0, 6.3, 0, 0x4d8c3a),
    blob(2.1, 1, -1.5, 7.6, 0.6, 0x5a9c44),
    blob(1.7, 0, 1.6, 7.9, -0.8, 0x62a64a),
    blob(1.5, 0, 0.3, 8.9, 1.2, 0x69ad4e),
  ]);
}

/* One instanced mesh from a list of { x, y, z, yaw, sx, sy, sz }. */
function instanced(geo, mat, places, name) {
  const mesh = new THREE.InstancedMesh(geo, mat, places.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  places.forEach((t, i) => {
    p.set(t.x, t.y, t.z);
    if (t.quat) {
      q.copy(t.quat);
    } else {
      q.setFromAxisAngle(up, t.yaw);
    }
    s.set(t.sx, t.sy, t.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.name = name;
  return mesh;
}

/* A flat fan over a closed loop of points at one height: the lake. */
function fan(cx, cz, loop, y) {
  const pos = [cx, y, cz];
  const idx = [];
  for (const p of loop) {
    pos.push(p.x, y, p.z);
  }
  for (let k = 1; k <= loop.length; k += 1) {
    idx.push(0, k === loop.length ? 1 : k + 1, k);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* A flat ring between an outer and an inner loop of the same length: the
 * shallows and the wet line along the shore. */
function ring(outer, inner, y) {
  const pos = [];
  const idx = [];
  const n = outer.length;
  for (let k = 0; k < n; k += 1) {
    pos.push(outer[k].x, y, outer[k].z, inner[k].x, y, inner[k].z);
  }
  for (let k = 0; k < n; k += 1) {
    const a = k * 2;
    const b = ((k + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* A rowing boat: a lathed hull open at the top, two thwarts and a keel
 * strip, three and a half metres long, in the village's timber. */
function rowingBoat(mats) {
  const g = new THREE.Group();
  const hull = new THREE.LatheGeometry([
    new THREE.Vector2(0.03, 0),
    new THREE.Vector2(0.42, 0.08),
    new THREE.Vector2(0.6, 0.3),
    new THREE.Vector2(0.66, 0.52),
  ], 10);
  hull.scale(1, 1, 2.7);
  /* Its own material rather than the village's timber: the hull is open
   * and its inside has to draw. Same colour, both faces. */
  const body = new THREE.Mesh(hull, celMaterial({ color: 0x5e3f26, rim: 0.1, side: THREE.DoubleSide }));
  body.castShadow = true;
  g.add(body);
  for (const z of [-0.6, 0.5]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.28), mats.trim);
    seat.position.set(0, 0.36, z);
    g.add(seat);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 3.4), mats.timberDark);
  keel.position.y = -0.02;
  g.add(keel);
  return g;
}

/*
 * Build the living valley into ctx.scene. ctx carries the heightfield
 * as heightAt(x, z), the valley axis, a seeded rng of its own, the
 * colliders, the village's materials and the progress hook. Returns
 * what the title's stats read.
 */
export async function buildNature(ctx) {
  const { scene, heightAt, valleyAxis, rng, colliders, mats } = ctx;
  const slopeAt = (x, z) => {
    const sx = (heightAt(x + 10, z) - heightAt(x - 10, z)) / 20;
    const sz = (heightAt(x, z + 10) - heightAt(x, z - 10)) / 20;
    return { sx, sz, s: Math.hypot(sx, sz) };
  };
  /* Where nothing grows: the strip and its approaches, the village
   * plateau, the road with its verges and the street. The plateau's
   * box is the brief's; the garden trees are placed by hand inside it. */
  const keepOff = (x, z) => {
    if (Math.abs(x) < STRIP_W / 2 + 25 && Math.abs(z) < STRIP_L / 2 + 70) {
      return true;
    }
    if (x > -320 && x < 60 && z > -260 && z < 260) {
      return true;
    }
    if (z > -2720 && z < 1980 && Math.abs(x - (valleyAxis(z) + 55)) < 9) {
      return true;
    }
    return Math.abs(z - 115) < 8 && x < valleyAxis(115) + 70 && x > -215;
  };
  const near = (x, z) => Math.hypot(x, z) < COLLIDE_R;

  /*
   * THE LAKE. The basin's shore is wherever the terrain crosses the
   * water level, found by marching out from the middle of the basin
   * along a hundred and forty four rays: a fan over those points is the
   * water, a ring inside them is the wet line, a ring to where the bed
   * is two and a half metres down is the shallows, silt seen through
   * water, and a fan over the deep middle darkens it. The rings are
   * sheets that do not write depth, so the ink pass draws the shore
   * once, from the body.
   */
  const lakeCx = valleyAxis(LAKE_Z);
  const lakeCz = (LAKE_Z - 800 + LAKE_END) / 2;
  const RAYS = 144;
  const shore = [];
  const wet = [];
  const shallow = [];
  const deep = [];
  for (let k = 0; k < RAYS; k += 1) {
    const a = (k / RAYS) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    let r = 0;
    let rShallow = 0;
    let rDeep = 0;
    while (r < 1100 && heightAt(lakeCx + cx * r, lakeCz + cz * r) < LAKE_Y) {
      const d = LAKE_Y - heightAt(lakeCx + cx * r, lakeCz + cz * r);
      if (d > 2.5) {
        rShallow = r;
      }
      if (d > 11) {
        rDeep = r;
      }
      r += 3;
    }
    /* The crossing, interpolated inside the last three metres. */
    const h0 = heightAt(lakeCx + cx * (r - 3), lakeCz + cz * (r - 3));
    const h1 = heightAt(lakeCx + cx * r, lakeCz + cz * r);
    const rs = r - 3 + 3 * Math.max(0, Math.min(1, (LAKE_Y - h0) / Math.max(1e-3, h1 - h0)));
    shore.push({ x: lakeCx + cx * rs, z: lakeCz + cz * rs, r: rs, a });
    wet.push({ x: lakeCx + cx * (rs - 1.8), z: lakeCz + cz * (rs - 1.8) });
    shallow.push({ x: lakeCx + cx * rShallow, z: lakeCz + cz * rShallow });
    deep.push({ x: lakeCx + cx * rDeep, z: lakeCz + cz * rDeep });
  }
  const waterMat = celMaterial({ color: 0x3b6d8c, rim: 0.38, rimColor: 0xdfeeff, transparent: true, opacity: 0.9 });
  const sheet = (color, opacity) => {
    const m = celMaterial({ color, rim: 0.2, rimColor: 0xdfeeff, transparent: true, opacity });
    m.depthWrite = false;
    return m;
  };
  const lake = new THREE.Mesh(fan(lakeCx, lakeCz, shore, LAKE_Y), waterMat);
  lake.name = 'lake';
  scene.add(lake);
  scene.add(new THREE.Mesh(ring(shore, wet, LAKE_Y + 0.035), sheet(0xd6e6ec, 0.75)));
  scene.add(new THREE.Mesh(ring(wet, shallow, LAKE_Y + 0.025), sheet(0x79ad9c, 0.5)));
  scene.add(new THREE.Mesh(fan(lakeCx, lakeCz, deep, LAKE_Y + 0.015), sheet(0x2a4f70, 0.5)));

  /* Reeds in the shallows, in clumps, thick round the sheltered east and
   * west shores and thin where the jetty and the path are. */
  const bladeGeo = new THREE.ConeGeometry(0.06, 1, 4, 1, true);
  bladeGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(0.07, 0.42, 4, 1);
  headGeo.translate(0, 0.21, 0);
  const blades = [[], []];
  const heads = [];
  let reedClumps = 0;
  for (let k = 0; k < 4000 && reedClumps < 420; k += 1) {
    const s = shore[Math.floor(rng() * RAYS)];
    const facing = Math.cos(s.a);
    /* East and west shores are sheltered; the north shore is the
     * village's side and is kept clear. */
    const dense = 0.15 + 0.8 * Math.abs(facing) * (1 - smoothstep(-0.9, -0.5, Math.sin(s.a)));
    if (rng() > dense) {
      continue;
    }
    const inward = 1.5 + rng() * 9;
    const x = s.x - Math.cos(s.a) * inward + (rng() - 0.5) * 4;
    const z = s.z - Math.sin(s.a) * inward + (rng() - 0.5) * 4;
    const d = LAKE_Y - heightAt(x, z);
    if (d < 0.05 || d > 1.0) {
      continue;
    }
    reedClumps += 1;
    const n = 6 + Math.floor(rng() * 5);
    for (let b = 0; b < n; b += 1) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.45;
      const hh = 1.1 + rng() * 0.8;
      const lean = 0.05 + rng() * 0.2;
      const la = rng() * Math.PI * 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * Math.sin(la), 0, -lean * Math.cos(la)));
      blades[b % 2].push({ x: x + Math.cos(a) * rr, y: LAKE_Y - d, z: z + Math.sin(a) * rr, quat: q, sx: 1, sy: hh, sz: 1 });
      if (rng() < 0.3) {
        heads.push({ x: x + Math.cos(a) * rr + Math.sin(la) * lean * hh * 0.5, y: LAKE_Y - d + hh * 0.97, z: z + Math.sin(a) * rr - Math.cos(la) * lean * hh * 0.5, quat: q, sx: 1, sy: 1, sz: 1 });
      }
    }
  }
  scene.add(instanced(bladeGeo, celMaterial({ color: 0x86a34e, rim: 0.1 }), blades[0], 'reeds'));
  scene.add(instanced(bladeGeo, celMaterial({ color: 0x6b8a3c, rim: 0.1 }), blades[1], 'reeds-deep'));
  scene.add(instanced(headGeo, celMaterial({ color: 0x6b4e2e, rim: 0.1 }), heads, 'reed-heads'));

  /*
   * THE JETTY, off the north shore in line with the road, with a boat
   * tied up alongside and another pulled up on the gravel; and the
   * shore path along the north shore either side of it.
   */
  const jettyX = valleyAxis(LAKE_Z - 800) + 55;
  let jettyZ = LAKE_Z - 900;
  while (heightAt(jettyX, jettyZ) > LAKE_Y && jettyZ < LAKE_Z) {
    jettyZ += 1;
  }
  const deckY = LAKE_Y + 0.75;
  const jetty = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 24), mats.timberDark);
  deck.position.set(0, deckY, 6);
  deck.castShadow = true;
  jetty.add(deck);
  for (let z = -5; z <= 17; z += 5.5) {
    for (const x of [-0.9, 0.9]) {
      const bed = Math.min(heightAt(jettyX + x, jettyZ + z), deckY - 0.4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, deckY + 0.35 - bed, 6), mats.fence);
      post.position.set(x, (deckY + 0.35 + bed) / 2, z);
      jetty.add(post);
    }
  }
  const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6), mats.timberDark);
  bollard.position.set(0.8, deckY + 0.4, 17.5);
  jetty.add(bollard);
  jetty.position.set(jettyX, 0, jettyZ);
  scene.add(jetty);
  const moored = rowingBoat(mats);
  moored.position.set(jettyX + 2.3, LAKE_Y - 0.1, jettyZ + 12);
  moored.rotation.y = 0.08;
  scene.add(moored);
  const beached = rowingBoat(mats);
  const bx = jettyX - 14;
  const bz = jettyZ - 6;
  beached.position.set(bx, heightAt(bx, bz) + 0.1, bz);
  beached.rotation.set(0, -0.5, 0.12);
  scene.add(beached);
  const shorePath = [];
  for (const s of shore) {
    if (Math.sin(s.a) < -0.45) {
      shorePath.push({ x: lakeCx + Math.cos(s.a) * (s.r + 7), z: lakeCz + Math.sin(s.a) * (s.r + 7) });
    }
  }
  const gravelMat = celMaterial({ color: 0xb8ad95, rim: 0 });
  scene.add(ribbon(shorePath, 2, 0.06, heightAt, gravelMat).mesh);
  await ctx.paint(0.5);

  /*
   * THE STREAM, from the hanging valley over the lip, down the side
   * valley's trough and the floor to the lake, west of the strip. Its
   * centre line on the floor is streamX, which the village's bridge is
   * built on; above the top of that line it follows the trough east to
   * the pool at the lip's foot, climbs the face as the fall, and runs
   * on up the hanging valley. Three ribbons: a dark wet bank under a
   * gravel bed under the water, the water seen through to the bed.
   */
  const trough = (dx) => SIDE_Z + 10 * smoothstep(700, 1000, dx) + 6 * Math.sin(dx / 60);
  const topDx = streamX(SIDE_Z) - valleyAxis(SIDE_Z);
  const upper = [];
  for (let dx = LIP_DX + 260; dx > topDx; dx -= 5) {
    const z = trough(dx);
    upper.push({ x: valleyAxis(z) + dx, z });
  }
  const lower = [];
  for (let z = SIDE_Z; z <= LAKE_Z && heightAt(streamX(z), z) > LAKE_Y + 0.2; z += 12) {
    lower.push({ x: streamX(z), z });
  }
  const streamPts = upper.concat(lower);
  const bankMat = celMaterial({ color: 0x4d6a31, rim: 0.05 });
  const bedMat = celMaterial({ color: 0x8f8a78, rim: 0.05 });
  const streamMat = celMaterial({ color: 0x3d7a97, rim: 0.4, rimColor: 0xe6f3ff, transparent: true, opacity: 0.72 });
  for (const [pts, w] of [[upper, 3.6], [lower, 5.2]]) {
    scene.add(ribbon(pts, w * 1.5, 0.04, heightAt, bankMat).mesh);
    scene.add(ribbon(pts, w * 1.1, 0.08, heightAt, bedMat).mesh);
    scene.add(ribbon(pts, w, 0.14, heightAt, streamMat).mesh);
  }
  /* The fall: the water over the lip drawn white, a ribbon of foam laid
   * on the water down the face, and the pool it lands in. */
  const foamMat = celMaterial({ color: 0xf3f8fb, rim: 0.05 });
  const fall = upper.filter((p) => {
    const dx = p.x - valleyAxis(p.z);
    return dx > POOL.dx + POOL.r * 0.75 && dx < LIP_DX + 40;
  });
  scene.add(ribbon(fall, 5, 0.3, heightAt, foamMat).mesh);
  const poolX = valleyAxis(POOL.z) + POOL.dx;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r * 0.9, 24), waterMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(poolX, POOL.y - 0.6, POOL.z);
  scene.add(pool);
  /* Rapids: foam quads on the water wherever the stream drops steeply,
   * which is the whole torrent down the side valley, and spray round
   * the foot of the fall. */
  const foamGeo = new THREE.PlaneGeometry(1, 1);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = [];
  for (let k = 1; k < streamPts.length; k += 1) {
    const a = streamPts[k - 1];
    const b = streamPts[k];
    const drop = (heightAt(a.x, a.z) - heightAt(b.x, b.z)) / Math.hypot(b.x - a.x, b.z - a.z);
    if (drop < 0.22) {
      continue;
    }
    const n = 1 + Math.floor(drop * 6);
    for (let q = 0; q < n; q += 1) {
      const t = rng();
      const x = a.x + (b.x - a.x) * t + (rng() - 0.5) * 2.2;
      const z = a.z + (b.z - a.z) * t + (rng() - 0.5) * 2.2;
      const w = 0.7 + rng() * 1.1;
      foam.push({ x, y: heightAt(x, z) + 0.2, z, yaw: rng() * Math.PI, sx: w, sy: 1, sz: w * 0.55 });
    }
  }
  for (let q = 0; q < 26; q += 1) {
    const a = rng() * Math.PI * 2;
    const rr = 3 + rng() * 8;
    const x = poolX + POOL.r * 0.6 + Math.cos(a) * rr;
    const z = POOL.z + Math.sin(a) * rr;
    foam.push({ x, y: POOL.y - 0.5, z, yaw: rng() * Math.PI, sx: 1.5 + rng() * 2, sy: 1, sz: 1 + rng() * 1.5 });
  }
  scene.add(instanced(foamGeo, celMaterial({ color: 0xf3f8fb, rim: 0.05, side: THREE.DoubleSide }), foam, 'foam'));
  await ctx.paint(0.54);

  /*
   * TREES. Spruce from the foot of the walls to the tree line, larch
   * taking over toward it, beech at the foot of the walls and on the
   * floor along the stream and in the fields, all where forestDensity
   * says and never on the strip, the road, the street or the plateau.
   * Every species is one geometry with its colours in the vertices, so
   * a band of forest is one draw call a species. Trees within reach of
   * the strip get a post for the trunk, and the beeches a sphere for
   * each of the two big blobs.
   */
  const treeMat = celMaterial({ color: 0xffffff, rim: 0.16 });
  treeMat.vertexColors = true;
  const species = {
    spruceTall: { geo: spruceTall(), h: 16 },
    spruceSquat: { geo: spruceSquat(), h: 12 },
    larch: { geo: larch(), h: 15 },
    beech: { geo: beech(), h: 10 },
  };
  const stands = {};
  for (const name of Object.keys(species)) {
    stands[name] = Array.from({ length: BANDS }, () => []);
  }
  let conifers = 0;
  let broadleaf = 0;
  const plant = (name, x, y, z, s, tall = 1) => {
    const yaw = rng() * Math.PI * 2;
    stands[name][bandOf(z)].push({ x, y: y - 0.15, z, yaw, sx: s, sy: s * tall, sz: s });
    if (name === 'beech') {
      broadleaf += 1;
      if (near(x, z)) {
        colliders.addPost('tree', x, z, y, y + 4.4 * s, 0.4 * s);
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        colliders.addSphere('canopy', x, y + 6.3 * s, z, 2.9 * s);
        colliders.addSphere('canopy', x + (-1.5 * c + 0.6 * sn) * s, y + 7.6 * s, z + (1.5 * sn + 0.6 * c) * s, 2.1 * s);
      }
      return;
    }
    conifers += 1;
    if (near(x, z)) {
      colliders.addPost('tree', x, z, y, y + species[name].h * s * tall * 0.9, 1.3 * s);
    }
  };
  let tries = 0;
  while (conifers + broadleaf < 3300 && tries < 260000) {
    tries += 1;
    const x = (rng() - 0.5) * FIELD * 0.94;
    const z = (rng() - 0.5) * FIELD * 0.94;
    const y = heightAt(x, z);
    if (y < 30 || y > TREE_LINE + 70) {
      continue;
    }
    const sl = slopeAt(x, z);
    if (sl.s > 0.95) {
      continue;
    }
    const d = forestDensity(x, y, z, sl.s, sl.sz);
    if (rng() > d) {
      continue;
    }
    if (keepOff(x, z)) {
      continue;
    }
    const line = treeLine(x, z);
    const larchP = 0.85 * smoothstep(line - 320, line - 60, y);
    const beechP = 0.4 * (1 - smoothstep(90, 200, y)) * (1 - smoothstep(0.35, 0.6, sl.s));
    const pick = rng();
    if (pick < beechP) {
      plant('beech', x, y, z, 0.8 + rng() * 0.8);
    } else if (pick < beechP + larchP) {
      plant('larch', x, y, z, 0.9 + rng() * 0.8, 0.9 + rng() * 0.3);
    } else if (rng() < 0.7) {
      plant('spruceTall', x, y, z, 1.0 + rng() * 0.9, 0.9 + rng() * 0.35);
    } else {
      plant('spruceSquat', x, y, z, 1.0 + rng() * 0.8, 0.9 + rng() * 0.3);
    }
  }
  /* The floor: beech in clumps along the stream's banks and singly in
   * the fields, and the village's garden trees by hand. */
  for (let k = 0; k < 900; k += 1) {
    let x;
    let z;
    if (rng() < 0.65) {
      const at = lower[Math.floor(rng() * lower.length)];
      const side = rng() < 0.5 ? -1 : 1;
      x = at.x + side * (6 + rng() * 22);
      z = at.z + (rng() - 0.5) * 30;
    } else {
      z = (rng() - 0.5) * FIELD * 0.8;
      x = valleyAxis(z) + (rng() - 0.5) * 700;
      if (noise2(x / 120 + 7.7, z / 120 + 1.1) < 0.6) {
        continue;
      }
    }
    const y = heightAt(x, z);
    if (y < LAKE_Y + 2.5 || y > 60 || keepOff(x, z) || Math.abs(x - streamX(z)) < 5) {
      continue;
    }
    plant('beech', x, y, z, 0.8 + rng() * 0.8);
  }
  for (const g of [[-262, 140], [-262, 84], [-155, 187], [-95, 189], [-215, 186], [-70, 34], [-140, 32], [-205, 38], [-300, 60], [-296, 180]]) {
    plant('beech', g[0], heightAt(g[0], g[1]), g[1], 0.8 + rng() * 0.4);
  }
  for (const name of Object.keys(species)) {
    stands[name].forEach((places, b) => {
      if (places.length) {
        scene.add(instanced(species[name].geo, treeMat, places, `${name}-${b}`));
      }
    });
  }
  await ctx.paint(0.6);

  /*
   * BOULDERS. Three sizes of dodecahedron, seeded onto the steep ground
   * and the scree, thickest under the cliffs, with a scatter along the
   * torrent in the side valley. Rocks within reach of the strip get a
   * sphere.
   */
  const rockMat = celMaterial({ color: 0x8b8880, rim: 0.26 });
  const sizes = [0.9, 1.7, 3.0];
  const rockGeos = sizes.map((r) => new THREE.DodecahedronGeometry(r, 0));
  const rocks = sizes.map(() => Array.from({ length: BANDS }, () => []));
  const dropRock = (x, z, y, size) => {
    const r = sizes[size];
    const sy = 0.65 + rng() * 0.35;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    const cy = y + r * 0.3 * sy;
    rocks[size][bandOf(z)].push({ x, y: cy, z, quat: q, sx: 1, sy, sz: 1 });
    if (near(x, z)) {
      colliders.addSphere('rock', x, cy, z, r * 0.9);
    }
  };
  let rockCount = 0;
  for (tries = 0; tries < 120000 && rockCount < 1000; tries += 1) {
    const x = (rng() - 0.5) * FIELD * 0.94;
    const z = (rng() - 0.5) * FIELD * 0.94;
    const y = heightAt(x, z);
    if (y < 70 || y > SNOW_LINE + 250) {
      continue;
    }
    const sl = slopeAt(x, z);
    const clump = smoothstep(0.5, 0.75, noise2(x / 90 + 1.1, z / 90 + 6.3));
    const p = smoothstep(0.5, 1.15, sl.s) * (0.25 + 0.75 * clump);
    if (rng() > p || keepOff(x, z)) {
      continue;
    }
    const pick = rng();
    dropRock(x, z, y, pick < 0.55 ? 0 : pick < 0.87 ? 1 : 2);
    rockCount += 1;
  }
  for (let k = 0; k < 70; k += 1) {
    const at = upper[Math.floor(rng() * upper.length)];
    const dx = at.x - valleyAxis(at.z);
    if (dx > LIP_DX - 50 && dx < LIP_DX + 50) {
      continue;
    }
    const side = rng() < 0.5 ? -1 : 1;
    const x = at.x + (rng() - 0.5) * 4;
    const z = at.z + side * (2.5 + rng() * 7);
    dropRock(x, z, heightAt(x, z), rng() < 0.7 ? 0 : 1);
    rockCount += 1;
  }
  rocks.forEach((bands, size) => {
    bands.forEach((places, b) => {
      if (places.length) {
        scene.add(instanced(rockGeos[size], rockMat, places, `rocks-${size}-${b}`));
      }
    });
  });

  /*
   * FLOWERS. Small tilted quads in the pasture below the tree line, in
   * the same patches the paint warms, yellow and white with a little
   * purple, and never in the forest.
   */
  const petalGeo = new THREE.PlaneGeometry(0.42, 0.42);
  petalGeo.rotateX(-Math.PI / 2 + 0.6);
  const petals = [[], [], []];
  const petalMats = [0xf2d94e, 0xf6f3e8, 0x9a6fc4].map((color) => celMaterial({ color, rim: 0, side: THREE.DoubleSide }));
  let flowers = 0;
  /* Clusters, not singles: one candidate that passes every test seeds
   * a dozen flowers round it, each costing one height read, which is
   * a tenth of the cost of testing every flower on its own. */
  for (tries = 0; tries < 40000 && flowers < 6000; tries += 1) {
    const z = (rng() - 0.5) * FIELD * 0.94;
    const x = valleyAxis(z) + (rng() - 0.5) * 2400;
    const bloom = smoothstep(0.58, 0.7, noise2(x / 34 + 9.1, z / 34 + 3.7));
    if (bloom < 0.05) {
      continue;
    }
    const y = heightAt(x, z);
    if (y < 15 || y > TREE_LINE - 160) {
      continue;
    }
    const sl = slopeAt(x, z);
    if (sl.s > 0.5 || rng() > bloom * (y < 60 ? 0.6 : 1)) {
      continue;
    }
    if (forestDensity(x, y, z, sl.s, sl.sz) > 0.15 || keepOff(x, z)) {
      continue;
    }
    const n = 8 + Math.floor(rng() * 10);
    for (let k = 0; k < n; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 7;
      const fx = x + Math.cos(a) * r;
      const fz = z + Math.sin(a) * r;
      const pick = rng();
      const s = 0.8 + rng() * 0.5;
      petals[pick < 0.5 ? 0 : pick < 0.88 ? 1 : 2].push({ x: fx, y: heightAt(fx, fz) + 0.1, z: fz, yaw: rng() * Math.PI * 2, sx: s, sy: s, sz: s });
      flowers += 1;
    }
  }
  petals.forEach((places, k) => {
    if (places.length) {
      scene.add(instanced(petalGeo, petalMats[k], places, `flowers-${k}`));
    }
  });

  /*
   * OLD SNOW in the hollows below the snow line: flat octagons laid on
   * the ground's own slope over the patches the paint already whitens,
   * so what stands off the terrain reads as the drift's thickness.
   */
  const driftGeo = new THREE.CircleGeometry(1, 8);
  driftGeo.rotateX(-Math.PI / 2);
  const drifts = [];
  const nrm = new THREE.Vector3();
  const upV = new THREE.Vector3(0, 1, 0);
  for (tries = 0; tries < 60000 && drifts.length < 260; tries += 1) {
    const x = (rng() - 0.5) * FIELD * 0.94;
    const z = (rng() - 0.5) * FIELD * 0.94;
    if (noise2(x / 60 + 2.2, z / 60 + 7.9) < 0.72) {
      continue;
    }
    const y = heightAt(x, z);
    if (y < SNOW_LINE - 330 || y > SNOW_LINE - 90) {
      continue;
    }
    const sl = slopeAt(x, z);
    if (sl.s > 0.7) {
      continue;
    }
    nrm.set(-sl.sx, 1, -sl.sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(upV, nrm);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(upV, rng() * Math.PI));
    const r = 6 + rng() * 10;
    drifts.push({ x, y: y + 0.35, z, quat: q, sx: r, sy: 1, sz: r * (0.55 + rng() * 0.4) });
  }
  scene.add(instanced(driftGeo, celMaterial({ color: 0xf6f8fb, rim: 0.2 }), drifts, 'drifts'));
  await ctx.paint(0.64);

  return { pines: conifers, broadleaf, streamPts, rocks: rockCount, flowers, reeds: reedClumps };
}
