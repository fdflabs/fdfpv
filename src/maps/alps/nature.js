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
 * Built in sections so a second look of the valley can take the parts
 * it wants: natureSites works out where things are without drawing
 * anything, and each build function draws one thing from those sites.
 * buildNature runs every section in the order the valley has always
 * been built in, on the one rng, so the cel valley is the same valley.
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
import { noise2, smoothstep } from './noise.js';
import { ribbon } from './ribbon.js';
import {
  FIELD, HALF, STRIP_L, STRIP_W, LAKE_N, LAKE_Y, LAKE_END, SIDE_Z, LIP_DX, POOL,
  TREE_LINE, SNOW_LINE, streamX, treeLine, forestDensity,
} from './terrain.js';
import { makeWaves, patchGeometry, placePatch, injectWaves, starLoops, outlineBox, probeSurface } from '../../render/lakewaves.js';

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

/* Four sides for a conifer's trunk, which shows only below the first
 * tier; the triangles go to the tiers. */
function trunk(r0, r1, h, hex, sides = 4) {
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
 * a curved band edge rather than as a crumple of facets. Twenty faces
 * a blob: a crown is five of them, and with smooth normals the cel
 * bands round them off. At eighty faces, the next subdivision, the
 * beeches alone were a hundred and eighteen thousand triangles in view
 * at the strip, a fifth of the whole budget. */
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
 * showing between the tiers. Beech: a trunk and a crown of five blobs.
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
    blob(2.9, 0, 0, 6.3, 0, 0x4d8c3a),
    blob(2.1, 0, -1.5, 7.6, 0.6, 0x5a9c44),
    blob(2.0, 0, 1.4, 7.3, 1.1, 0x55963f),
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
 * strip, three and a half metres long, in the jetty's timber. */
function rowingBoat(mats, timber, look) {
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
  const body = new THREE.Mesh(hull, look.material('boat-hull', { color: 0x5e3f26, rim: 0.1, side: THREE.DoubleSide }));
  body.castShadow = true;
  g.add(body);
  for (const z of [-0.6, 0.5]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.28), mats.trim);
    seat.position.set(0, 0.36, z);
    g.add(seat);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 3.4), timber);
  keel.position.y = -0.02;
  g.add(keel);
  return g;
}

/*
 * Where the valley's nature goes, worked out once and drawn by nothing:
 * the side valley's trough and the headwall's band, the ground with the
 * ledge on it, where nothing may grow, the lake's shore and the
 * stream's line. No rng is drawn here, so a look that builds only some
 * of the sections still stands them where the cel valley does.
 */
export function natureSites(ctx) {
  const { heightAt, valleyAxis } = ctx;
  const slopeAt = (x, z) => {
    const sx = (heightAt(x + 10, z) - heightAt(x - 10, z)) / 20;
    const sz = (heightAt(x, z + 10) - heightAt(x, z - 10)) / 20;
    return { sx, sz, s: Math.hypot(sx, sz) };
  };
  /*
   * The side valley's trough, which the stream follows up to the fall,
   * and the cliff band the fall drops over. The band runs along the
   * hanging valley's lip, its foot twenty metres short of LIP_DX and its
   * top the ground thirty metres past it, with a level ledge between
   * the two over the slope the heightfield can hold. It is full height
   * across the side valley and dies away into the hillside either side
   * as the lip does, so its ends are the lip's own ends. faceDx is how
   * far out from the axis the face stands at z, wandering a little.
   */
  const trough = (dx) => SIDE_Z + 10 * smoothstep(700, 1000, dx) + 6 * Math.sin(dx / 60);
  const fallZ = trough(POOL.dx + POOL.r);
  const BAND = 430;
  const inBand = (z) => Math.abs(z - fallZ) < BAND;
  const faceDx = (z) => LIP_DX - 20 + 7 * (noise2(z / 45 + 3.3, 8.1) - 0.5);
  const BACK_DX = LIP_DX + 30;
  const bandTop = (z, foot) => {
    const full = heightAt(valleyAxis(z) + BACK_DX, z);
    const w = smoothstep(0.35, 0.75, Math.exp(-Math.pow((z - SIDE_Z) / 420, 2)));
    return foot + Math.max(0, full - foot) * w;
  };
  /* The ground with the ledge on it: what the stream above the fall
   * lies on. */
  const groundAt = (x, z) => {
    const h = heightAt(x, z);
    const dx = x - valleyAxis(z);
    if (!inBand(z) || dx < faceDx(z) || dx > BACK_DX) {
      return h;
    }
    return Math.max(h, bandTop(z, heightAt(valleyAxis(z) + faceDx(z), z)));
  };
  const lipY = bandTop(fallZ, heightAt(valleyAxis(fallZ) + faceDx(fallZ), fallZ));
  const fallX = valleyAxis(fallZ) + faceDx(fallZ);

  /*
   * Where nothing grows: the strip and its approaches, the road with its
   * verges, the street out to it, the headwall and its ledge, the pool,
   * and the village. The village is built after this module, so its
   * footprints cannot be read here; the two boxes are drawn round what
   * village.js stands: every house, the
   * square, the street and its lanes, both western farms with their
   * yards and pastures, and the hangar, and the eastern farm up the
   * valley. Measured off its wall colliders, the furthest of which are
   * at x -334 and z 312, and x 235, z 491 for the eastern farm; each box
   * is at least fifteen metres clear of them so no canopy reaches a
   * roof.
   */
  const eastFarm = { x: valleyAxis(450) + 105, z: 468 };
  const keepOff = (x, z) => {
    if (Math.abs(x) < STRIP_W / 2 + 25 && Math.abs(z) < STRIP_L / 2 + 70) {
      return true;
    }
    if (x > -355 && x < 85 && z > -320 && z < 350) {
      return true;
    }
    if (Math.abs(x - eastFarm.x) < 75 && Math.abs(z - eastFarm.z) < 70) {
      return true;
    }
    if (inBand(z) && x - valleyAxis(z) > faceDx(z) - 30 && x - valleyAxis(z) < BACK_DX + 6) {
      return true;
    }
    if (Math.hypot(x - valleyAxis(POOL.z) - POOL.dx, z - POOL.z) < POOL.r + 12) {
      return true;
    }
    if (Math.abs(z - 115) < 8 && x < valleyAxis(115) + 70 && x > -215) {
      return true;
    }
    return z > -2720 && z < 1980 && Math.abs(x - (valleyAxis(z) + 55)) < 9;
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
  const lakeCz = (LAKE_N + LAKE_END) / 2;
  const lakeCx = valleyAxis(lakeCz);
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

  /*
   * THE STREAM, from the hanging valley over the lip, down the side
   * valley's trough and the floor to the lake, west of the strip. Its
   * centre line on the floor is streamX, which the village's bridge is
   * built on; above the top of that line it follows the trough east to
   * the pool at the lip's foot, climbs the face as the fall, and runs
   * on up the hanging valley.
   */
  const topDx = streamX(SIDE_Z) - valleyAxis(SIDE_Z);
  const upper = [];
  for (let dx = LIP_DX + 260; dx > topDx; dx -= 5) {
    const z = trough(dx);
    upper.push({ x: valleyAxis(z) + dx, z });
  }
  const lower = [];
  for (let z = SIDE_Z; z <= LAKE_END && heightAt(streamX(z), z) > LAKE_Y + 0.2; z += 12) {
    lower.push({ x: streamX(z), z });
  }
  const streamPts = upper.concat(lower);
  /* Above the headwall the stream runs on its ledge; the one segment
   * that would span the face is the fall, and is left out. */
  const onLedge = (p) => inBand(p.z) && p.x - valleyAxis(p.z) >= faceDx(p.z);
  const aboveFall = upper.filter(onLedge);
  const belowFall = upper.filter((p) => !onLedge(p));
  return {
    slopeAt, trough, fallZ, BAND, inBand, faceDx, BACK_DX, bandTop, groundAt, lipY, fallX,
    keepOff, near, lakeCx, lakeCz, RAYS, shore, wet, shallow, deep,
    upper, lower, streamPts, onLedge, aboveFall, belowFall,
  };
}

/* The lake's water over the shore natureSites found: a fan for the body,
 * a ring inside the shore for the wet line, a ring to where the bed is
 * two and a half metres down for the shallows, silt seen through water,
 * and a fan over the deep middle to darken it. The rings are sheets that
 * do not write depth, so the ink pass draws the shore once, from the
 * body. Returns the water's material, which the pool shares, and the
 * waves' hook (lakeWaves). */
export function buildLake(ctx, sites) {
  const { scene, look } = ctx;
  const { lakeCx, lakeCz, shore, wet, shallow, deep } = sites;
  const bodyOpts = { color: 0x3b6d8c, rim: 0.38, rimColor: 0xdfeeff, transparent: true, opacity: 0.9 };
  const waterMat = look.material('lake', bodyOpts);
  const sheetOpts = (color, opacity) => ({ color, rim: 0.2, rimColor: 0xdfeeff, transparent: true, opacity });
  const sheet = (name, opts) => {
    const m = look.material(name, opts);
    m.depthWrite = false;
    return m;
  };
  const lake = new THREE.Mesh(fan(lakeCx, lakeCz, shore, LAKE_Y), waterMat);
  lake.name = 'lake';
  scene.add(lake);
  /* Each sheet with the loops it lies between (rows of starLoops below,
   * -1 for none) and its lift over the water, for the waves. */
  const layers = [{ mesh: lake, name: 'lake', opts: bodyOpts, outer: 0, inner: -1, lift: 0 }];
  for (const [name, color, opacity, outer, inner, lift, geo] of [
    ['lake-wet', 0xd6e6ec, 0.75, 0, 1, 0.035, ring(shore, wet, LAKE_Y + 0.035)],
    ['lake-shallow', 0x79ad9c, 0.5, 1, 2, 0.025, ring(wet, shallow, LAKE_Y + 0.025)],
    ['lake-deep', 0x2a4f70, 0.5, 3, -1, 0.015, fan(lakeCx, lakeCz, deep, LAKE_Y + 0.015)],
  ]) {
    const opts = sheetOpts(color, opacity);
    const mesh = new THREE.Mesh(geo, sheet(name, opts));
    scene.add(mesh);
    layers.push({ mesh, name, opts, outer, inner, lift });
  }
  return { waterMat, waves: lakeWaves(ctx, sites, layers) };
}

/*
 * THE LAKE'S WAVES, the plant's (src/render/lakewaves.js), when the shell
 * declares them: nothing is built or changed until it does, so the valley
 * with still water is the valley as it was, to the scene's fingerprint.
 * Then each sheet is drawn over again on the dense patch near the
 * aircraft or the camera, in its own look, cut to the part of the patch
 * its own fan or ring covers, and the sheets themselves cut a hole there;
 * all of them take the waves' slope for their light. The patch's sheets
 * are drawn first of everything see through, in the sheets' own order,
 * as the lake's are, whatever their distance.
 */
function lakeWaves(ctx, sites, layers) {
  const { lakeCx, lakeCz, shore, wet, shallow, deep } = sites;
  const centre = { x: lakeCx, z: lakeCz };
  const box = outlineBox(shore, 10);
  let built = null;
  const build = () => {
    const waves = makeWaves();
    const star = starLoops(centre, [shore, wet, shallow, deep]);
    const geo = patchGeometry();
    const near = new THREE.Group();
    near.name = 'lake-near';
    near.renderOrder = -1;
    const patches = layers.map((l, k) => {
      injectWaves(l.mesh.material, waves, { hole: true, res: 1000 });
      const mat = ctx.look.material(`${l.name}-near`, l.opts);
      mat.depthWrite = l.mesh.material.depthWrite;
      injectWaves(mat, waves, { patch: true, clip: { ...star, outer: l.outer, inner: l.inner } });
      const m = new THREE.Mesh(geo, mat);
      m.name = `${l.name}-near`;
      m.renderOrder = k;
      m.userData.waveLift = l.lift;
      m.userData.zone = [l.outer, l.inner];
      near.add(m);
      return m;
    });
    /* How far out each loop reaches, least and most, so a sheet whose
     * zone the patch does not touch is not drawn. */
    const reach = [shore, wet, shallow, deep].map((loop) => {
      const r = loop.map((p) => Math.hypot(p.x - lakeCx, p.z - lakeCz));
      return [Math.min(...r), Math.max(...r)];
    });
    ctx.scene.add(near);
    layers[0].mesh.userData.waveRes = 1000;
    return { waves, patches, reach, near, star, geo };
  };
  return {
    setWaves(bodies) {
      let best = null;
      for (const b of bodies || []) {
        if (!best || Math.hypot(b.ox - lakeCx, b.oz - lakeCz) < Math.hypot(best.ox - lakeCx, best.oz - lakeCz)) {
          best = b;
        }
      }
      if (!best && !built) {
        return;
      }
      built ??= build();
      built.waves.set(best);
    },
    updateWaves(t, craft) {
      if (!built) {
        return;
      }
      const { waves, patches, reach } = built;
      waves.tick(t);
      const onLake = craft && waves.body && Math.abs(craft.position.y - waves.body.y0) < 10 ? craft.position : null;
      if (placePatch(waves, patches, ctx.camera, onLake, box)) {
        const u = waves.uniforms.uPatch.value;
        const d = Math.hypot(u.x - lakeCx, u.y - lakeCz);
        const r = u.w * Math.SQRT2;
        for (const m of patches) {
          const [outer, inner] = m.userData.zone;
          m.visible = d - r < reach[outer][1] && (inner < 0 || d + r > reach[inner][0]);
        }
      }
    },
    /* What the scene's own disposal cannot find: the zones' texture is a
     * uniform of a material three does not list. The rest goes with the
     * scene. */
    dispose() {
      if (built) {
        built.star.texture.dispose();
      }
    },
    probeWater(x, z) {
      if (!built || !built.waves.body) {
        return null;
      }
      const u = built.waves.uniforms.uPatch.value;
      const inPatch = u.w > 0 && Math.max(Math.abs(x - u.x), Math.abs(z - u.y)) < u.w;
      const mesh = inPatch ? built.patches[0] : layers[0].mesh;
      return { y: probeSurface(ctx.renderer, mesh, built.waves, x, z), patch: inPatch, t: built.waves.t };
    },
  };
}

/* Reeds in the shallows, in clumps, thick round the sheltered east and
 * west shores and thin where the jetty and the path are. */
/* A blade is two crossed triangles and a head a three sided spike:
 * there are three and a half thousand blades, and as four sided cones
 * they were twenty seven thousand triangles for something a few
 * pixels wide. */
export function buildReeds(ctx, sites) {
  const { scene, heightAt, rng, look } = ctx;
  const { shore, RAYS } = sites;
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.06, 0, 0, 0.06, 0, 0, 0, 1, 0,
    0, 0, -0.06, 0, 0, 0.06, 0, 1, 0,
  ], 3));
  bladeGeo.computeVertexNormals();
  const headGeo = new THREE.ConeGeometry(0.07, 0.42, 3, 1, true);
  headGeo.translate(0, 0.21, 0);
  const blades = [[], []];
  const heads = [];
  const tip = new THREE.Vector3();
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
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * Math.sin(la), rng() * Math.PI, -lean * Math.cos(la), 'YXZ'));
      const rx = x + Math.cos(a) * rr;
      const rz = z + Math.sin(a) * rr;
      blades[b % 2].push({ x: rx, y: LAKE_Y - d, z: rz, quat: q, sx: 1, sy: hh, sz: 1 });
      if (rng() < 0.3) {
        tip.set(0, hh * 0.97, 0).applyQuaternion(q);
        heads.push({ x: rx + tip.x, y: LAKE_Y - d + tip.y, z: rz + tip.z, quat: q, sx: 1, sy: 1, sz: 1 });
      }
    }
  }
  scene.add(instanced(bladeGeo, look.material('reeds', { color: 0x86a34e, rim: 0.1, side: THREE.DoubleSide }), blades[0], 'reeds'));
  scene.add(instanced(bladeGeo, look.material('reeds-deep', { color: 0x6b8a3c, rim: 0.1, side: THREE.DoubleSide }), blades[1], 'reeds-deep'));
  scene.add(instanced(headGeo, look.material('reed-heads', { color: 0x6b4e2e, rim: 0.1, side: THREE.DoubleSide }), heads, 'reed-heads'));
  return reedClumps;
}

/*
 * THE JETTY, off the north shore in line with the road, with a boat
 * tied up alongside and another pulled up on the gravel; the shore
 * path along the north shore either side of it, and a gravel track on
 * from where the road ends to the jetty's foot. ROAD_END is where
 * village.js stops the road.
 */
export function buildShore(ctx, sites) {
  const { scene, heightAt, valleyAxis, mats, look } = ctx;
  const { lakeCx, lakeCz, shore } = sites;
  const ROAD_END = 1950;
  const jettyX = valleyAxis(ROAD_END) + 55;
  let jettyZ = ROAD_END;
  while (heightAt(jettyX, jettyZ) > LAKE_Y && jettyZ < LAKE_END) {
    jettyZ += 1;
  }
  const deckY = LAKE_Y + 0.75;
  /* The village's materials have no dark timber, and a missing one draws
   * as three's default white, which is what the deck did. */
  const timber = look.material('timber', { color: 0x5b4632, rim: 0.1 });
  const jetty = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 24), timber);
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
  const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6), timber);
  bollard.position.set(0.8, deckY + 0.4, 17.5);
  jetty.add(bollard);
  jetty.position.set(jettyX, 0, jettyZ);
  scene.add(jetty);
  const moored = rowingBoat(mats, timber, look);
  moored.position.set(jettyX + 2.3, LAKE_Y - 0.1, jettyZ + 12);
  moored.rotation.y = 0.08;
  scene.add(moored);
  const beached = rowingBoat(mats, timber, look);
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
  const gravelMat = look.material('gravel-path', { color: 0xb8ad95, rim: 0 });
  scene.add(ribbon(shorePath, 2, 0.06, heightAt, gravelMat).mesh);
  const track = [];
  for (let z = ROAD_END - 4; z < jettyZ - 5; z += 6) {
    track.push({ x: jettyX, z });
  }
  track.push({ x: jettyX, z: jettyZ - 4 });
  scene.add(ribbon(track, 3.2, 0.05, heightAt, gravelMat).mesh);
}

/* The stream along the line natureSites laid: three ribbons, a dark wet
 * bank under a gravel bed under the water, the water seen through to
 * the bed. */
export function buildStream(ctx, sites) {
  const { scene, look } = ctx;
  const { groundAt, aboveFall, belowFall, lower } = sites;
  const bankMat = look.material('stream-bank', { color: 0x4d6a31, rim: 0.05 });
  const bedMat = look.material('stream-bed', { color: 0x8f8a78, rim: 0.05 });
  const streamMat = look.material('stream', { color: 0x3d7a97, rim: 0.4, rimColor: 0xe6f3ff, transparent: true, opacity: 0.72 });
  for (const [pts, w] of [[aboveFall, 3.6], [belowFall, 3.6], [lower, 5.2]]) {
    scene.add(ribbon(pts, w * 1.5, 0.04, groundAt, bankMat).mesh);
    scene.add(ribbon(pts, w * 1.1, 0.08, groundAt, bedMat).mesh);
    scene.add(ribbon(pts, w, 0.14, groundAt, streamMat).mesh);
  }
}

/*
 * THE HEADWALL. The heightfield's thirty metre cells cannot hold a
 * face much steeper than forty five degrees, and water laid down a
 * slope that shallow read as a white stripe painted on the hill. So
 * the lip gets a cliff of its own: banded rock from the foot of the
 * lip to its top, broken into crags by the noise, with a turf ledge
 * back to where the ground comes up to meet it. No collider: its
 * nearest end is twelve hundred metres from the strip, past the seven
 * hundred the brief gives colliders.
 */
export function buildHeadwall(ctx, sites) {
  const { scene, heightAt, valleyAxis, look } = ctx;
  const { fallZ, BAND, faceDx, bandTop, BACK_DX } = sites;
  {
    const COLS = Math.round((2 * BAND) / 6);
    const ROWS = 16;
    const pos = [];
    const col = [];
    const face = [];
    const ledge = [];
    const rockLight = new THREE.Color(0xa99c8a);
    const rockDark = new THREE.Color(0x88796a);
    const turf = new THREE.Color(0x6d7f45);
    for (let k = 0; k <= COLS; k += 1) {
      const z = fallZ - BAND + (2 * BAND * k) / COLS;
      const ax = valleyAxis(z);
      const fx = ax + faceDx(z);
      const foot = heightAt(fx, z);
      const top = bandTop(z, foot);
      const base = foot - 3;
      const rows = [];
      for (let r = 0; r <= ROWS; r += 1) {
        const y = base + ((top - base) * r) / ROWS;
        const crag = r === 0 || r === ROWS ? 0 : 3.2 * (noise2(k * 0.83 + 4.1, r * 0.91 + 2.3) - 0.5);
        rows.push([fx - crag, y, z]);
      }
      face.push(rows);
      ledge.push([[fx, top, z], [ax + BACK_DX, top, z]]);
    }
    const tri = (a, b, c, colour) => {
      pos.push(...a, ...b, ...c);
      for (let q = 0; q < 3; q += 1) {
        col.push(colour.r, colour.g, colour.b);
      }
    };
    /* Winding: the face looks down the valley at the pool, the ledge
     * looks up. */
    for (let k = 0; k < COLS; k += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const a = face[k][r];
        const b = face[k][r + 1];
        const c = face[k + 1][r];
        const d = face[k + 1][r + 1];
        /* Strata: a dark band in three, following the rows round. */
        const band = r % 3 === 1;
        tri(a, c, b, band ? rockDark : rockLight);
        tri(c, d, b, band ? rockDark : rockLight);
      }
      const a = ledge[k][0];
      const b = ledge[k][1];
      const c = ledge[k + 1][0];
      const d = ledge[k + 1][1];
      tri(a, c, b, turf);
      tri(c, d, b, turf);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = look.parts('headwall', { rim: 0.2 });
    const wall = new THREE.Mesh(geo, mat);
    wall.name = 'headwall';
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }
}

/*
 * THE FALL: a curtain from the lip to the pool, standing clear of the
 * face and bellying out as it drops, streaked white and pale blue,
 * with spray heaped at its foot. Double sided, because the wing can
 * fly behind it.
 * The pool at its foot takes the lake's water, `waterMat`.
 */
export function buildFall(ctx, sites, waterMat) {
  const { scene, heightAt, valleyAxis, rng, look } = ctx;
  const { lipY, fallX, fallZ } = sites;
  {
    const ROWS = 12;
    const STREAKS = [0xffffff, 0xe4f0f6, 0xffffff, 0xd3e6f0, 0xf4f9fb, 0xe4f0f6, 0xffffff];
    const pos = [];
    const col = [];
    const top = lipY + 0.4;
    const out = (t) => 2.5 + 8 * Math.pow(t, 1.5);
    const footX = fallX - out(1);
    const bottom = Math.min(heightAt(footX, fallZ), POOL.y) - 0.6;
    const at = (t, s) => {
      const w = 9 + 7 * t;
      return [fallX - out(t), top + (bottom - top) * t, fallZ + (s - 0.5) * w];
    };
    for (let r = 0; r < ROWS; r += 1) {
      for (let q = 0; q < STREAKS.length; q += 1) {
        const t0 = r / ROWS;
        const t1 = (r + 1) / ROWS;
        const s0 = q / STREAKS.length;
        const s1 = (q + 1) / STREAKS.length;
        const quad = [at(t0, s0), at(t0, s1), at(t1, s0), at(t1, s1)];
        const c = new THREE.Color(STREAKS[q]);
        for (const v of [quad[0], quad[2], quad[1], quad[1], quad[2], quad[3]]) {
          pos.push(...v);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = look.parts('fall', { rim: 0.3, rimColor: 0xffffff, side: THREE.DoubleSide });
    const curtain = new THREE.Mesh(geo, mat);
    curtain.name = 'fall';
    scene.add(curtain);
    const spray = [];
    for (let q = 0; q < 9; q += 1) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * 7;
      const r = 2.5 + rng() * 3.5;
      spray.push(blob(r, 0, footX + Math.cos(a) * rr * 0.7, bottom + r * 0.2, fallZ + Math.sin(a) * rr * 1.3, 0xf4f8fb));
    }
    const sprayMat = look.parts('spray', { rim: 0.25, rimColor: 0xffffff });
    const mist = new THREE.Mesh(merge(spray), sprayMat);
    mist.name = 'spray';
    scene.add(mist);
  }
  const poolX = valleyAxis(POOL.z) + POOL.dx;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r * 0.9, 24), waterMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(poolX, POOL.y - 0.6, POOL.z);
  scene.add(pool);
}

/* Rapids: foam quads on the water wherever the stream drops steeply,
 * which is the whole torrent down the side valley, and spray round
 * the foot of the fall. */
export function buildFoam(ctx, sites) {
  const { scene, rng, look } = ctx;
  const { streamPts, groundAt, onLedge, fallX, fallZ } = sites;
  const foamGeo = new THREE.PlaneGeometry(1, 1);
  foamGeo.rotateX(-Math.PI / 2);
  const foam = [];
  for (let k = 1; k < streamPts.length; k += 1) {
    const a = streamPts[k - 1];
    const b = streamPts[k];
    const drop = (groundAt(a.x, a.z) - groundAt(b.x, b.z)) / Math.hypot(b.x - a.x, b.z - a.z);
    if (drop < 0.22 || onLedge(a) !== onLedge(b)) {
      continue;
    }
    const n = 1 + Math.floor(drop * 6);
    for (let q = 0; q < n; q += 1) {
      const t = rng();
      const x = a.x + (b.x - a.x) * t + (rng() - 0.5) * 2.2;
      const z = a.z + (b.z - a.z) * t + (rng() - 0.5) * 2.2;
      const w = 0.7 + rng() * 1.1;
      foam.push({ x, y: groundAt(x, z) + 0.2, z, yaw: rng() * Math.PI, sx: w, sy: 1, sz: w * 0.55 });
    }
  }
  for (let q = 0; q < 26; q += 1) {
    const a = rng() * Math.PI * 2;
    const rr = 3 + rng() * 8;
    const x = fallX - 16 + Math.cos(a) * rr;
    const z = fallZ + Math.sin(a) * rr;
    foam.push({ x, y: POOL.y - 0.5, z, yaw: rng() * Math.PI, sx: 1.5 + rng() * 2, sy: 1, sz: 1 + rng() * 1.5 });
  }
  scene.add(instanced(foamGeo, look.material('foam', { color: 0xf3f8fb, rim: 0.05, side: THREE.DoubleSide }), foam, 'foam'));
}

/*
 * TREES. Spruce from the foot of the walls to the tree line, larch
 * taking over toward it, beech at the foot of the walls and on the
 * floor along the stream and in the fields, all where forestDensity
 * says and never on the strip, the road, the street or the plateau.
 * Every species is one geometry with its colours in the vertices, so
 * a band of forest is one draw call a species. Trees within reach of
 * the strip get a post for the trunk, and the beeches a sphere for
 * each of the two big blobs.
 * Returns the two counts the title prints.
 */
export function buildForests(ctx, sites) {
  const { scene, heightAt, valleyAxis, rng, colliders, look } = ctx;
  const { slopeAt, keepOff, near, lower } = sites;
  const treeMat = look.parts('trees', { rim: 0.16 });
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
   * the fields. */
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
  for (const name of Object.keys(species)) {
    stands[name].forEach((places, b) => {
      if (places.length) {
        scene.add(instanced(species[name].geo, treeMat, places, `${name}-${b}`));
      }
    });
  }
  return { conifers, broadleaf };
}

/*
 * BOULDERS. Three sizes of icosahedron, seeded onto the steep ground
 * and the scree, thickest under the cliffs, with a scatter along the
 * torrent in the side valley. Rocks within reach of the strip get a
 * sphere. Twenty faces a rock rather than a dodecahedron's thirty six,
 * which over a thousand rocks is sixteen thousand triangles.
 * Returns how many.
 */
export function buildRocks(ctx, sites) {
  const { scene, heightAt, rng, colliders, look } = ctx;
  const { slopeAt, keepOff, near, upper } = sites;
  const rockMat = look.material('rock', { color: 0x8b8880, rim: 0.26 });
  const sizes = [0.9, 1.7, 3.0];
  const rockGeos = sizes.map((r) => new THREE.IcosahedronGeometry(r, 0));
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
  for (let tries = 0; tries < 120000 && rockCount < 1000; tries += 1) {
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
    const side = rng() < 0.5 ? -1 : 1;
    const x = at.x + (rng() - 0.5) * 4;
    const z = at.z + side * (2.5 + rng() * 7);
    if (keepOff(x, z)) {
      continue;
    }
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
  return rockCount;
}

/*
 * FLOWERS. Small tilted quads in the pasture below the tree line, in
 * the same patches the paint warms, yellow and white with a little
 * purple, and never in the forest.
 * Returns how many.
 */
export function buildFlowers(ctx, sites) {
  const { scene, heightAt, valleyAxis, rng, look } = ctx;
  const { slopeAt, keepOff } = sites;
  const petalGeo = new THREE.PlaneGeometry(0.42, 0.42);
  petalGeo.rotateX(-Math.PI / 2 + 0.6);
  const petals = [[], [], []];
  const petalMats = [0xf2d94e, 0xf6f3e8, 0x9a6fc4].map((color) => look.material('flowers', { color, rim: 0, side: THREE.DoubleSide }));
  let flowers = 0;
  /* Clusters, not singles: one candidate that passes every test seeds
   * a dozen flowers round it, each costing one height read, which is
   * a tenth of the cost of testing every flower on its own. */
  for (let tries = 0; tries < 40000 && flowers < 6000; tries += 1) {
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
  return flowers;
}

/*
 * OLD SNOW in the hollows below the snow line: flat octagons laid on
 * the ground's own slope over the patches the paint already whitens,
 * so what stands off the terrain reads as the drift's thickness.
 */
export function buildDrifts(ctx, sites) {
  const { scene, heightAt, rng, look } = ctx;
  const { slopeAt } = sites;
  const driftGeo = new THREE.CircleGeometry(1, 8);
  driftGeo.rotateX(-Math.PI / 2);
  const drifts = [];
  const nrm = new THREE.Vector3();
  const upV = new THREE.Vector3(0, 1, 0);
  for (let tries = 0; tries < 60000 && drifts.length < 260; tries += 1) {
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
  scene.add(instanced(driftGeo, look.material('drift', { color: 0xf6f8fb, rim: 0.2 }), drifts, 'drifts'));
}

/*
 * Build the living valley into ctx.scene. ctx carries the heightfield
 * as heightAt(x, z), the valley axis, a seeded rng of its own, the
 * colliders, the village's materials and the progress hook. Returns
 * what the title's stats read.
 */
export async function buildNature(ctx) {
  const sites = natureSites(ctx);
  const { waterMat, waves } = buildLake(ctx, sites);
  const reedClumps = buildReeds(ctx, sites);
  buildShore(ctx, sites);
  await ctx.paint(0.5);

  buildStream(ctx, sites);
  buildHeadwall(ctx, sites);
  buildFall(ctx, sites, waterMat);
  buildFoam(ctx, sites);
  await ctx.paint(0.54);

  const { conifers, broadleaf } = buildForests(ctx, sites);
  await ctx.paint(0.6);

  const rockCount = buildRocks(ctx, sites);
  const flowers = buildFlowers(ctx, sites);
  buildDrifts(ctx, sites);
  await ctx.paint(0.64);

  return {
    pines: conifers, broadleaf, streamPts: sites.streamPts, rocks: rockCount, flowers, reeds: reedClumps,
    setWaves: waves.setWaves, updateWaves: waves.updateWaves, probeWater: waves.probeWater, disposeWaves: waves.dispose,
  };
}
