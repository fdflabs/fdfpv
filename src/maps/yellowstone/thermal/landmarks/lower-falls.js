/*
 * lower-falls.js: the Lower Falls of the Yellowstone, and the yellow walls
 * of the Grand Canyon of the Yellowstone below them.
 *
 * The river narrows to about twenty metres at the brink and drops 94 m
 * (308 ft) in one free leap into a plunge pool, the top of the fall a
 * glassy green where the water is thickest and the rest a white curtain,
 * with a column of spray and mist standing out of the pool higher than the
 * fall. Below, the canyon is three hundred metres deep and its walls are
 * rhyolite altered by hot water: yellow, cream, ochre, orange and pink in
 * streaked bands, with the lodgepole forest on the ledges and the rims.
 *
 * Elevation data at 30 m cannot hold a 94 m vertical step: it smooths it
 * into a steep ramp a few cells long. So the brink is found in the data
 * (the steepest fall along the river through the published position), a
 * rock step is built over the ramp, level at the brink and dropping sheer
 * at the ramp's foot, as the Alps' headwall is (src/maps/alps/nature.js),
 * and the curtain falls from its edge. Every vertex of the step is at or
 * above the ground; ground(x, z) says where it stands so the engine can
 * put a craft on it.
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
import { paintMaterial, LAYER } from '../paint.js';
import { SteamBuilder } from '../steam.js';
import { CellSet } from '../grid.js';
import { hash01 } from '../schedule.js';
import { patch, nearestRiver, ellipseCells } from './kit.js';

/* How far either side of the river the step runs into the canyon walls,
 * and how far the painted walls reach. */
const HALF_W = 48;
const WALL_REACH = 460;
const WALL_LENGTH = 1900;

function smoothstepJs(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* Points along a river polyline at a spacing, with their distance along. */
function resample(points, step) {
  const out = [];
  let s = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t < len; t += step) {
      out.push({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len, s: s + t, w: a.w + (b.w - a.w) * (t / len) });
    }
    s += len;
  }
  const last = points[points.length - 1];
  out.push({ x: last.x, z: last.z, s, w: last.w });
  return out;
}

/*
 * The brink and the foot, from the ground along the river: the steepest
 * forty metres within four hundred of the published position, then out
 * from it to where the ground stops falling hard at each end.
 */
export function findFall(heightAt, rivers, x, z) {
  const near = nearestRiver(rivers, x, z, 600);
  if (!near) {
    return null;
  }
  const pts = resample(near.river.points, 2).filter((p) => Math.hypot(p.x - x, p.z - z) < 420);
  if (pts.length < 30) {
    return null;
  }
  for (const p of pts) {
    p.y = heightAt(p.x, p.z);
  }
  let best = 0;
  let bi = 0;
  for (let i = 0; i + 20 < pts.length; i += 1) {
    const d = pts[i].y - pts[i + 20].y;
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  let top = bi;
  while (top > 0 && pts[top - 1].y - pts[top].y > 0.15) {
    top -= 1;
  }
  let foot = bi + 20;
  while (foot + 1 < pts.length && pts[foot].y - pts[foot + 1].y > 0.15) {
    foot += 1;
  }
  const a = pts[top];
  const b = pts[foot];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return {
    lip: a, foot: b, drop: a.y - b.y, width: Math.max(12, near.w * 0.8),
    dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len }, run: len, river: near.river,
  };
}

export function buildLowerFalls(env, f) {
  const { heightAt } = env;
  const group = new THREE.Group();
  group.name = 'lower-falls';
  const fall = findFall(heightAt, env.rivers, f.x, f.z);
  if (!fall) {
    /* No river through the published position in hydro.json: nothing to
     * hang a fall on, and a fall placed by guesswork would stand in the
     * wrong place in the canyon. Said, not hidden. */
    return { id: 'lower-falls', group, update() {}, particles: 0, focus: null, missing: 'no river through the falls in hydro.json' };
  }
  const { lip, foot, dir } = fall;
  const n = { x: -dir.z, z: dir.x };
  const yLip = lip.y;
  const yFoot = foot.y;
  /* The face stands a few metres short of the ramp's foot, so the curtain
   * lands in the pool and not on the ramp. */
  const faceS = Math.max(4, fall.run - 3);
  const P = (s, l) => ({ x: lip.x + dir.x * s + n.x * l, z: lip.z + dir.z * s + n.z * l });

  /* THE STEP: a ledge at the brink over the ramp, and the face. The
   * river has cut a notch: the brink is lowest where the water goes over
   * and the rock rises either side of it toward the canyon walls. The face
   * bows upstream at its ends, an amphitheatre rather than a dam, and
   * takes the canyon's colours in blotches, not bands. */
  const COLS = 32;
  const ROWS = 16;
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const blotch = [0xdcb65a, 0xe6dab6, 0xcf9a55, 0xd9c690, 0xc4844c, 0xe3cf9a];
  const notch = (l) => 16 * smoothstepJs(fall.width * 0.5, HALF_W, Math.abs(l)) ** 1.3;
  const bow = (l) => 22 * (l / HALF_W) ** 2;
  const face = [];
  for (let k = 0; k <= COLS; k += 1) {
    const l = -HALF_W + (2 * HALF_W * k) / COLS;
    const top = yLip - 0.1 + notch(l) + (hash01(k, 3) - 0.5) * 0.6;
    const column = [];
    /* The ledge: rows from behind the brink to the face top. */
    for (const sRow of [-8, 0, faceS * 0.5]) {
      const p = P(Math.min(sRow, faceS - bow(l) - 1), l);
      column.push(pos.length / 3);
      pos.push(p.x, Math.max(heightAt(p.x, p.z), top), p.z);
      c.set(Math.abs(l) < fall.width * 0.6 ? 0x8f8468 : 0xc2aa72);
      col.push(c.r, c.g, c.b);
    }
    /* The face: sheer, cragged, down past the pool. */
    for (let r = 0; r <= ROWS; r += 1) {
      const t = r / ROWS;
      const crag = r === 0 || r === ROWS ? 0 : 2.6 * (hash01(k * 17 + r, 9) - 0.5);
      const p = P(faceS - bow(l) + crag + t * 3, l);
      const y = Math.max(heightAt(p.x, p.z), top + (yFoot - 5 - top) * t);
      column.push(pos.length / 3);
      pos.push(p.x, y, p.z);
      const b = Math.floor(hash01(Math.floor(k / 3) * 31 + Math.floor(r / 3 + hash01(k, 5) * 2), 13) * blotch.length);
      c.set(blotch[b]);
      col.push(c.r, c.g, c.b);
    }
    face.push(column);
  }
  for (let k = 0; k < COLS; k += 1) {
    const a = face[k];
    const b = face[k + 1];
    for (let r = 0; r + 1 < a.length; r += 1) {
      idx.push(a[r], a[r + 1], b[r], b[r], a[r + 1], b[r + 1]);
    }
  }
  const stepGeo = new THREE.BufferGeometry();
  stepGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  stepGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  stepGeo.setIndex(idx);
  stepGeo.computeVertexNormals();
  const stepMat = new THREE.MeshToonMaterial();
  const rock = paintMaterial({ key: 'lower-falls-rock', cel: { rim: 0.2, side: THREE.DoubleSide }, body: '' });
  rock.vertexColors = true;
  const step = new THREE.Mesh(stepGeo, rock);
  step.name = 'lower-falls-step';
  step.castShadow = true;
  step.receiveShadow = true;
  group.add(step);
  stepMat.dispose();

  /* THE WATER: over the ledge to the brink as a green glassy sheet, then
   * the curtain, bellying out as it falls, streaked, the streaks moving. */
  const W = fall.width;
  const ROWS_C = 16;
  const ACROSS = 8;
  const cpos = [];
  const cuv = [];
  const cidx = [];
  const drop = yLip - (yFoot - 1.5);
  const at = (t, u) => {
    if (t < 0) {
      /* On the ledge: t from -1 (behind the brink) to 0 (the edge). */
      const s = faceS * (1 + t) - 10 * -t;
      const p = P(s, (u - 0.5) * W * 1.1);
      return [p.x, Math.max(heightAt(p.x, p.z), yLip) + 0.25, p.z];
    }
    const out = 1.5 + 9 * t ** 1.4;
    const w = W * (1 + 0.45 * t);
    const p = P(faceS + out, (u - 0.5) * w);
    return [p.x, yLip + 0.25 - drop * t, p.z];
  };
  const rowsT = [-1, -0.5, 0, ...Array.from({ length: ROWS_C }, (_, r) => (r + 1) / ROWS_C)];
  rowsT.forEach((t, r) => {
    for (let q = 0; q <= ACROSS; q += 1) {
      cpos.push(...at(t, q / ACROSS));
      cuv.push(q / ACROSS, t);
      if (r > 0 && q > 0) {
        const a = (r - 1) * (ACROSS + 1) + q - 1;
        const b = r * (ACROSS + 1) + q - 1;
        cidx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cgeo.setAttribute('aFall', new THREE.Float32BufferAttribute(cuv, 2));
  cgeo.setIndex(cidx);
  cgeo.computeVertexNormals();
  const curtainMat = paintMaterial({
    key: 'lower-falls-curtain',
    attrs: ['vec2 aFall'],
    cel: { rim: 0.3, rimColor: 0xffffff, side: THREE.DoubleSide },
    body: /* glsl */ `
      float across = vFall.x;
      float down = vFall.y;
      /* Streaks run down the curtain and move with the water. */
      float streak = ysNoise(vec2(across * 22.0, down * 5.0 - uCelTime * 1.8));
      float fine = ysNoise(vec2(across * 60.0, down * 14.0 - uCelTime * 3.1));
      vec3 white = ysRgb(0.97, 0.98, 0.98);
      vec3 grey = ysRgb(0.78, 0.84, 0.86);
      vec3 green = ysRgb(0.34, 0.56, 0.44);
      paint = mix(white, grey, smoothstep(0.55, 0.8, streak) * 0.7 + fine * 0.15);
      /* The green of the brink: thick water in a notch left of centre,
       * smooth over the ledge and for the top of the leap. */
      float notch = 1.0 - smoothstep(0.08, 0.2, abs(across - 0.42));
      float glassy = (1.0 - smoothstep(-0.2, 0.12 + 0.12 * notch, down));
      paint = mix(paint, green, glassy * 0.85);
      /* Frayed edges, spray tearing off the sides as it falls. */
      float fray = min(across, 1.0 - across) * 10.0 - down * 0.6 - fine * 0.8;
      if (down > 0.0 && fray < 0.0) {
        discard;
      }
    `,
  });
  const curtain = new THREE.Mesh(cgeo, curtainMat);
  curtain.name = 'lower-falls-curtain';
  group.add(curtain);

  /* THE PLUNGE: foam on the pool, and the mist column standing out of it
   * higher than the fall. */
  const base = P(faceS + 12, 0);
  const foam = paintMaterial({
    key: 'lower-falls-foam',
    bias: LAYER.water + 4,
    cel: { rim: 0.1 },
    uniforms: { uCentre: { value: new THREE.Vector2(base.x, base.z) } },
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      float r = length(d * vec2(1.0, 1.3));
      float churn = ysNoise(vCelWorld.xz * 0.25 + vec2(uCelTime * 0.7, -uCelTime * 0.4));
      if (r > 30.0 + churn * 14.0) {
        discard;
      }
      paint = mix(ysRgb(0.95, 0.97, 0.97), ysRgb(0.55, 0.72, 0.66), smoothstep(12.0, 34.0, r + churn * 10.0));
    `,
  });
  group.add(patch(ellipseCells(5, base.x, base.z, 46), heightAt, foam, { name: 'lower-falls-plunge' }));
  const mist = new SteamBuilder();
  /* The spray boils up from the foot and hangs over the pool, thickest
   * low down: the upper two thirds of the fall stay in the clear, as they
   * are seen from the rims. */
  mist.vent({ x: base.x, y: yFoot - 2, z: base.z, spread: 14, count: 14, size: 10, rise: drop * 0.35, life: 11, tint: 0xf2f6f7, alpha: 0.32, rng: env.rng });
  mist.vent({ x: base.x + dir.x * 20, y: yFoot, z: base.z + dir.z * 20, spread: 24, count: 8, size: 16, rise: drop * 0.9, life: 20, tint: 0xeef3f5, alpha: 0.18, rng: env.rng });
  group.add(mist.build(env, { detail: 1, name: 'lower-falls-mist' }));

  /* THE CANYON WALLS: painted over the steep ground downstream of the
   * brink, on the drape grid, so the paint is the ground's own shape. */
  const wallSet = new CellSet(10);
  const along = resample(fall.river.points, 25);
  const lipS = along.reduce((best, p) => (Math.hypot(p.x - lip.x, p.z - lip.z) < Math.hypot(best.x - lip.x, best.z - lip.z) ? p : best), along[0]).s;
  for (const p of along) {
    if (p.s < lipS - 150 || p.s > lipS + WALL_LENGTH) {
      continue;
    }
    wallSet.addDisc(p.x, p.z, WALL_REACH * (p.s < lipS ? 0.5 : 1));
  }
  const slopeAt = (px, pz) => {
    const sx = (heightAt(px + 5, pz) - heightAt(px - 5, pz)) / 10;
    const sz = (heightAt(px, pz + 5) - heightAt(px, pz - 5)) / 10;
    return Math.hypot(sx, sz);
  };
  const wallMat = paintMaterial({
    key: 'canyon-walls',
    attrs: ['vec2 aWall'],
    bias: LAYER.patch,
    cel: { rim: 0.16 },
    body: /* glsl */ `
      float slope = vWall.x;
      vec2 w = vCelWorld.xz;
      float y = vCelWorld.y;
      float edge = slope - (0.55 + 0.25 * ysNoise(w * 0.02));
      if (edge < 0.0) {
        discard;
      }
      /* Strata that wander, streaked downhill by what has washed over
       * them. */
      /* The altered rhyolite is blotched, not layered: big patches of
       * yellow and cream, ochre and a little pink where the alteration
       * went further, all combed downhill into streaks by what washes
       * over them. The patches are noise over position and height; the
       * streaks are noise stretched down the fall line. */
      vec3 yellow = ysRgb(0.90, 0.74, 0.32);
      vec3 cream = ysRgb(0.93, 0.89, 0.76);
      vec3 ochre = ysRgb(0.82, 0.56, 0.27);
      vec3 pink = ysRgb(0.86, 0.64, 0.56);
      vec3 rust = ysRgb(0.64, 0.37, 0.20);
      float streak = ysNoise(vec2(w.x * 0.09 + w.y * 0.07, y * 0.01));
      float blotch = ysFbm(vec2(w.x * 0.004 + w.y * 0.003, y * 0.012) + streak * 0.25);
      float blotch2 = ysFbm(vec2(w.y * 0.005 - w.x * 0.002, y * 0.02) + 5.0);
      vec3 c = mix(yellow, cream, smoothstep(0.45, 0.6, blotch));
      c = mix(c, ochre, smoothstep(0.6, 0.72, blotch2));
      c = mix(c, pink, smoothstep(0.66, 0.74, blotch) * smoothstep(0.4, 0.6, blotch2) * 0.7);
      c = mix(c, rust, smoothstep(0.66, 0.82, streak) * 0.45);
      c = mix(c, ysRgb(0.96, 0.95, 0.91), smoothstep(0.75, 0.9, ysNoise(vec2(w.x * 0.03, y * 0.03))) * 0.5);
      /* The forest holds on where the wall eases. */
      float trees = (1.0 - smoothstep(0.75, 1.05, slope)) * smoothstep(0.55, 0.7, ysNoise(w * 0.05 + 11.0));
      c = mix(c, ysRgb(0.23, 0.35, 0.21), trees);
      paint = mix(c * 0.92, c, smoothstep(0.0, 0.15, edge));
    `,
  });
  const walls = patch(wallSet, heightAt, wallMat, {
    name: 'canyon-walls',
    attrs: { aWall: 2 },
    fill: (px, pz, py, out) => {
      out.aWall = [slopeAt(px, pz), 0];
    },
  });
  group.add(walls);

  /* Where the step stands, for the engine's contact surface: the ledge's
   * top over the ramp it hides. */
  const ground = (px, pz) => {
    const dx = px - lip.x;
    const dz = pz - lip.z;
    const s = dx * dir.x + dz * dir.z;
    const l = dx * n.x + dz * n.z;
    if (s < -8 || s > faceS || Math.abs(l) > HALF_W) {
      return null;
    }
    return Math.max(heightAt(px, pz), yLip - 0.1);
  };
  /* From the ground: the canyon floor on the river bank a quarter of a
   * kilometre downstream; from the air, a hundred metres over the rim
   * down the canyon; both looking back up at the fall. */
  const mid = P(faceS, 0);
  const midY = (yLip + yFoot) / 2;
  const look = P(faceS + 260, 10);
  const air = P(faceS + 330, -40);
  const views = {
    ground: [look.x, heightAt(look.x, look.z) + 2, look.z, mid.x, midY + 10, mid.z],
    air: [air.x, Math.max(heightAt(air.x, air.z), yLip + 60) + 100, air.z, mid.x, midY, mid.z],
  };
  return {
    id: 'lower-falls',
    views,
    group,
    update() {},
    particles: mist.count,
    focus: { x: lip.x + dir.x * faceS, y: (yLip + yFoot) / 2, z: lip.z + dir.z * faceS, r: 300, height: fall.drop },
    fall: { drop: fall.drop, width: W, lip: { x: lip.x, y: yLip, z: lip.z }, dir },
    ground,
    wallCells: wallSet.size,
  };
}
