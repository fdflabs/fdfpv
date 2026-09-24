/*
 * kit.js: what the hero landmarks are built from.
 *
 * A painted patch of ground on the drape grid (a spring's rings, a mat's
 * runoff, a canyon's bands), the nearest river and which way it runs, a
 * boardwalk on posts following the ground, a lathed cone, and a hero geyser:
 * its schedule, its water and its steam, driven from the step clock.
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
import { celMaterial } from '../../../../render/celmat.js';
import { CellSet, buildCells } from '../grid.js';
import { paintMaterial, LAYER } from '../paint.js';
import { SteamBuilder } from '../steam.js';
import { heroJet } from '../jets.js';
import { makeSchedule, DEMO_INTERVALS } from '../schedule.js';

/*
 * A painted patch: the drape grid cells of `set` (a CellSet), each vertex at
 * the ground plus `lift(x, z)` (default 0, the exact drape), with the named
 * attributes filled by `fill(x, z, y, out)`, drawn with `material`.
 */
export function patch(set, heightAt, material, { lift, fill, attrs = {}, name }) {
  const built = buildCells(set, (x, z, out) => {
    const y = heightAt(x, z) + (lift ? lift(x, z) : 0);
    if (fill) {
      fill(x, z, y, out);
    }
    return y;
  }, attrs);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
  for (const [n, size] of Object.entries(attrs)) {
    geo.setAttribute(n, new THREE.BufferAttribute(built.attrs[n], size));
  }
  geo.setIndex(new THREE.BufferAttribute(built.index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

/* The cells of an ellipse (or circle) of half axes a, b turned by `turn`. */
export function ellipseCells(step, x, z, a, b = a, turn = 0) {
  const set = new CellSet(step);
  const r = Math.max(a, b);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const i0 = set.index(x - r - step);
  const i1 = set.index(x + r + step);
  const j0 = set.index(z - r - step);
  const j1 = set.index(z + r + step);
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const dx = set.coord(i) + step / 2 - x;
      const dz = set.coord(j) + step / 2 - z;
      const u = (dx * c + dz * s) / (a + step);
      const v = (-dx * s + dz * c) / (b + step);
      if (u * u + v * v <= 1) {
        set.add(i, j);
      }
    }
  }
  return set;
}

/*
 * The nearest point on any river to (x, z) within `reach`, with the unit
 * direction the water runs there (the polyline's own order, which NHD gives
 * downstream) and the width. Null when there is none, which a landmark
 * answers by picking a direction of its own.
 */
export function nearestRiver(rivers, x, z, reach = 800) {
  let best = null;
  for (const r of rivers ?? []) {
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) {
        continue;
      }
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d <= reach && (!best || d < best.d)) {
        const len = Math.sqrt(len2);
        best = { x: px, z: pz, d, dir: { x: dx / len, z: dz / len }, w: a.w + (b.w - a.w) * t, river: r, seg: i, t };
      }
    }
  }
  return best;
}

/* The unit direction from (x, z) toward the nearest river, or `fallback`
 * (radians, 0 = +x) when none is near. Runoff runs this way. */
export function runoffDir(rivers, x, z, fallback) {
  const r = nearestRiver(rivers, x, z, 700);
  if (!r || r.d < 1) {
    return { x: Math.cos(fallback), z: Math.sin(fallback), river: null };
  }
  return { x: (r.x - x) / r.d, z: (r.z - z) / r.d, river: r };
}

const WOOD = 0x8a6a4a;
const WOOD_DARK = 0x5d4633;
/*
 * A boardwalk along `points` ({ x, z }), `width` wide, its deck `clear`
 * metres over the highest ground under it at each station, stations every
 * two metres so it follows the ground as it rolls without ever dipping
 * into it, on posts every four metres. Returns one mesh.
 */
export function boardwalk(heightAt, points, { width = 2.4, clear = 0.45, name = 'boardwalk' } = {}) {
  const stations = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let k = i === 1 ? 0 : 1; k <= n; k += 1) {
      stations.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
  }
  const T = 0.14;
  const tanOf = (k) => {
    const a = stations[Math.max(0, k - 1)];
    const b = stations[Math.min(stations.length - 1, k + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  };
  /* Three strips, the deck's top and its two faces, each with its own
   * vertices so the edges shade as edges; and a post under each side
   * every four metres. One vertex coloured mesh, one draw. */
  const strips = [[], [], []];
  const posts = [];
  stations.forEach((st, k) => {
    const t = tanOf(k);
    const nx = -t.z;
    const nz = t.x;
    let ground = -Infinity;
    for (const side of [-0.5, 0, 0.5]) {
      ground = Math.max(ground, heightAt(st.x + nx * width * side, st.z + nz * width * side));
    }
    st.y = ground + clear;
    const L = { x: st.x - nx * width * 0.5, z: st.z - nz * width * 0.5 };
    const R = { x: st.x + nx * width * 0.5, z: st.z + nz * width * 0.5 };
    strips[0].push([L.x, st.y, L.z], [R.x, st.y, R.z]);
    strips[1].push([L.x, st.y - T, L.z], [L.x, st.y, L.z]);
    strips[2].push([R.x, st.y, R.z], [R.x, st.y - T, R.z]);
    if (k % 2 === 0) {
      for (const side of [-0.45, 0.45]) {
        const px = st.x + nx * width * side;
        const pz = st.z + nz * width * side;
        posts.push({ x: px, z: pz, y0: heightAt(px, pz) - 0.2, y1: st.y - T });
      }
    }
  });
  const pos = [];
  const col = [];
  const idx = [];
  const deckC = new THREE.Color(WOOD);
  const sideC = new THREE.Color(WOOD_DARK);
  strips.forEach((strip, q) => {
    const c = q === 0 ? deckC : sideC;
    const base = pos.length / 3;
    for (const v of strip) {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    }
    const tris = [];
    for (let k = 1; k < strip.length / 2; k += 1) {
      const a = base + (k - 1) * 2;
      const b = base + k * 2;
      tris.push([a, b, a + 1], [a + 1, b, b + 1]);
    }
    /* Wound whichever way makes the top face up and the faces out. */
    if (tris.length) {
      const [i0, i1, i2] = tris[0];
      const e1 = [pos[i1 * 3] - pos[i0 * 3], pos[i1 * 3 + 1] - pos[i0 * 3 + 1], pos[i1 * 3 + 2] - pos[i0 * 3 + 2]];
      const e2 = [pos[i2 * 3] - pos[i0 * 3], pos[i2 * 3 + 1] - pos[i0 * 3 + 1], pos[i2 * 3 + 2] - pos[i0 * 3 + 2]];
      const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const s0 = stations[0];
      const mid = [(pos[i0 * 3] + pos[i2 * 3]) / 2 - s0.x, 0, (pos[i0 * 3 + 2] + pos[i2 * 3 + 2]) / 2 - s0.z];
      const want = q === 0 ? nrm[1] : nrm[0] * mid[0] + nrm[2] * mid[2];
      const flip = want < 0;
      for (const tri of tris) {
        idx.push(...(flip ? [tri[0], tri[2], tri[1]] : tri));
      }
    }
  });
  const box = new THREE.BoxGeometry(0.16, 1, 0.16).toNonIndexed();
  const bp = box.getAttribute('position');
  for (const p of posts) {
    const h = Math.max(0.05, p.y1 - p.y0);
    const base = pos.length / 3;
    for (let k = 0; k < bp.count; k += 1) {
      pos.push(p.x + bp.getX(k), p.y0 + h / 2 + bp.getY(k) * h, p.z + bp.getZ(k));
      col.push(sideC.r, sideC.g, sideC.b);
      idx.push(base + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, rockMaterial());
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.stations = stations;
  mesh.userData.bake = true;
  return mesh;
}

/*
 * A lathed solid from a profile of [radius, height, hex] with the radius at
 * angle a scaled by shape(a, row), vertex coloured, standing at (x, foot, z).
 * Closed at the top by a fan to the last row's centre at `capY`.
 */
export function lathe(profile, { x, z, foot, segs = 16, shape, capY, capHex }) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const rows = profile.map(([r, h, hex], row) => {
    const ring = [];
    c.set(hex);
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const k = shape ? shape(a, row) : 1;
      const rr = r * k;
      ring.push(pos.length / 3);
      pos.push(x + Math.cos(a) * rr, foot + (typeof h === 'function' ? h(a) : h), z + Math.sin(a) * rr);
      col.push(c.r, c.g, c.b);
    }
    return ring;
  });
  for (let q = 1; q < rows.length; q += 1) {
    for (let s = 0; s < segs; s += 1) {
      const n = (s + 1) % segs;
      idx.push(rows[q - 1][s], rows[q][s], rows[q][n], rows[q - 1][s], rows[q][n], rows[q - 1][n]);
    }
  }
  if (capY !== undefined) {
    c.set(capHex);
    const top = pos.length / 3;
    pos.push(x, foot + capY, z);
    col.push(c.r, c.g, c.b);
    const last = rows[rows.length - 1];
    for (let s = 0; s < segs; s += 1) {
      idx.push(last[s], top, last[(s + 1) % segs]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

let rockMat = null;
/* The vertex coloured sinter and rock material the landmarks share. */
export function rockMaterial() {
  if (!rockMat) {
    rockMat = celMaterial({ color: 0xffffff, rim: 0.18 });
    rockMat.vertexColors = true;
  }
  return rockMat;
}

/* The lowest ground in a ring round (x, z): what a cone must stand on so
 * none of its foot floats. */
export function lowestAround(heightAt, x, z, r, n = 12) {
  let low = heightAt(x, z);
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    low = Math.min(low, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return low;
}

/*
 * A hero geyser's moving parts: its schedule, its column and its plume.
 * `style` names a schedule.js style; `vent` is { x, y, z }; `jet` overrides
 * heroJet's options; `plume` the steam's size. update(tSeconds) sets
 * everything from the pure schedule; state(t) says where it is.
 */
export function heroGeyser(env, { id, style, vent, peakMax, jet = {}, plume = {}, seed, rng, feature }) {
  /* The inventory's published interval, duration and height, when it has
   * them, over the style's. */
  const f = feature ?? {};
  const schedule = makeSchedule(style, { seed, interval: f.interval, duration: f.duration, height: f.height });
  const apex = Math.max(peakMax, f.height ? f.height.max : 0);
  /* A leaning column (Riverside) reaches its apex with only the upward
   * part of its speed, so it is launched for apex / cos squared. */
  const up = jet.dir ? jet.dir[1] / Math.hypot(...jet.dir) : 1;
  const col = heroJet(env, { x: vent.x, y: vent.y, z: vent.z, name: `${id}-column`, rng, ...jet, peak: apex / (up * up) });
  const big = plume.size ?? 5;
  /* Low steam round the vent, always on: it goes with the region's
   * ambient steam, one draw for the whole basin, so a quiet geyser costs
   * no draw of its own. */
  const quiet = env.ambient ?? new SteamBuilder();
  quiet.vent({ x: vent.x, y: vent.y + 0.3, z: vent.z, spread: 1.0, count: 12, size: big * 0.28, rise: 9, life: 7, alpha: 0.6, rng });
  /* The plume proper, switching on with the eruption, and the sheath of
   * steam boiling off the column itself, carried up at the column's speed
   * while the water is in the air. */
  const steam = new SteamBuilder();
  steam.vent({
    x: vent.x, y: vent.y + 2, z: vent.z, spread: plume.spread ?? 3, count: plume.count ?? 48, size: big, rise: plume.rise ?? apex * 1.4,
    life: plume.life ?? 14, alpha: 0.75, gate0: 0.2, gate1: 0.35, rng,
  });
  if (plume.sheath !== false) {
    steam.vent({
      x: vent.x, y: vent.y + 1, z: vent.z, spread: 1.5, count: plume.sheathCount ?? 60, size: big * 0.75, rise: apex * 1.05,
      life: 5, alpha: 0.8, gate0: 0.6, gate1: 0.95, rng,
    });
  }
  const steamMesh = steam.build(env, { detail: 1, name: `${id}-steam` });
  const group = new THREE.Group();
  group.name = `${id}-eruption`;
  group.add(col.mesh, steamMesh);
  const history = (t) => {
    const s = schedule.at(t);
    return { power: s.height / apex };
  };
  /* The last plume puff launched at the end of the steam phase is gone a
   * life later; until then the mesh stays. */
  const tail = (plume.life ?? 14) * 1.3;
  return {
    group,
    schedule,
    particles: col.mesh.userData.particles + steam.count,
    update(t) {
      col.update({ at: history }, t);
      col.mesh.visible = col.live();
      let gain = schedule.at(t).steam;
      for (let k = 1; k <= 3 && gain <= 0.2; k += 1) {
        gain = Math.max(gain, Math.min(0.21, schedule.at(t - (tail * k) / 3).steam));
      }
      steamMesh.userData.gain.value = gain;
      steamMesh.visible = gain > 0.2;
    },
    setDemo(on) {
      schedule.setInterval(on ? (typeof on === 'number' ? on : DEMO_INTERVALS[style]) : null);
    },
  };
}

/*
 * A hot pool's water is level, and it stands at the top of the sinter it
 * has built, overflowing on every side. The level is the highest ground
 * round its rim; inside the rim the surface is lifted to it, and outside
 * the lift falls away over `apron` radii, so the mound of sinter under the
 * runoff slopes down to the ground and nothing is ever below the terrain.
 * `unit(x, z)` is the point's radius as a fraction of the rim's.
 */
export function poolLevel(heightAt, x, z, r, n = 32) {
  let top = -Infinity;
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    top = Math.max(top, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return Math.max(top, heightAt(x, z));
}

export function levelLift(heightAt, level, unit, apron = 0.5) {
  return (x, z) => {
    const over = level - heightAt(x, z);
    if (over <= 0) {
      return 0;
    }
    const u = unit(x, z);
    const keep = u <= 1 ? 1 : 1 - Math.min(1, (u - 1) / apron) ** 0.7;
    return over * keep;
  };
}

/*
 * A geyser's mound of sinter: a dome `h` high over half axes a, b turned by
 * `turn`, lobed where its runoff has run longest, grey white with rust and
 * khaki channels down its flanks and dark and wet within `wet` metres of the
 * vent. On a 2 m drape grid lifted by the dome, so it is never under the
 * ground. Returns the mesh and the height of its top.
 */
export function sinterMound(env, { x, z, a, b, h, turn = 0, key, wet = 5, step = 2 }) {
  const { heightAt } = env;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const unit = (px, pz) => {
    const dx = px - x;
    const dz = pz - z;
    const u = (dx * c + dz * s) / a;
    const v = (-dx * s + dz * c) / b;
    const ang = Math.atan2(v, u);
    const lobe = 1 + 0.07 * Math.sin(3 * ang + 0.7) + 0.04 * Math.sin(5 * ang + 2.1) + 0.02 * Math.sin(9 * ang + 0.4);
    return Math.sqrt(u * u + v * v) / lobe;
  };
  const dome = (u) => (u >= 1 ? 0 : h * (1 - u * u) ** 1.6);
  const set = ellipseCells(step, x, z, a * 1.25, b * 1.25, turn);
  const mesh = patch(set, heightAt, moundMaterial(env), {
    name: `${key}-mound`,
    lift: (px, pz) => dome(unit(px, pz)),
    attrs: { aDome: 4 },
    fill: (px, pz, py, out) => {
      out.aDome = [unit(px, pz), x, z, wet];
    },
  });
  mesh.userData.bake = true;
  return { mesh, top: heightAt(x, z) + h, unit };
}

/*
 * The mounds' material, one per map so every mound of a region bakes into
 * one draw: the vent position and the wet radius ride in the vertex
 * attribute aDome (normalised radius, vent x, vent z, wet radius).
 */
function moundMaterial(env) {
  if (!env.materials.mound) {
    env.materials.mound = paintMaterial({
      key: 'sinter-mound',
      attrs: ['vec4 aDome'],
      bias: LAYER.patch,
      cel: { rim: 0.1 },
      body: /* glsl */ `
        vec2 d = vCelWorld.xz - vDome.yz;
        float r = length(d);
        float ang = atan(d.y, d.x);
        float uWet = vDome.w;
        if (vDome.x > 1.0) {
          discard;
        }
        vec3 sinter = ysRgb(0.86, 0.85, 0.81);
        vec3 grey = ysRgb(0.72, 0.71, 0.68);
        vec3 wetc = ysRgb(0.50, 0.47, 0.43);
        vec3 rust = ysRgb(0.78, 0.47, 0.24);
        vec3 khaki = ysRgb(0.64, 0.56, 0.38);
        paint = mix(sinter, grey, smoothstep(0.5, 0.8, ysFbm(vCelWorld.xz * 0.12)));
        /* Runoff channels: thin radial streaks, wandering, strongest on
         * the mid flanks where the water has slowed and cooled. */
        float wander = ysFbm(vec2(r * 0.06, ang * 2.0)) * 0.5;
        float lanes = ysNoise(vec2((ang + wander * 0.25) * 9.0, r * 0.03));
        float sector = smoothstep(0.35, 0.65, ysNoise(vec2(ang * 1.3 + 4.0, 0.5)));
        float chan = smoothstep(0.66, 0.8, lanes) * sector * smoothstep(uWet * 0.6, uWet * 1.4, r) * (1.0 - smoothstep(0.8, 1.0, vDome.x));
        paint = mix(paint, mix(rust, khaki, ysNoise(vCelWorld.xz * 0.2)), chan * 0.8);
        /* Wet round the vent, where the splashes land. */
        paint = mix(paint, wetc, 1.0 - smoothstep(uWet * 0.35, uWet * (1.0 + 0.3 * ysNoise(vec2(ang * 2.0, 1.0))), r));
        /* A darker crust at the fringe where the dome meets the soil. */
        paint *= mix(1.0, 0.86, smoothstep(0.85, 1.0, vDome.x));
      `,
    });
  }
  return env.materials.mound;
}

/*
 * One draw per material for everything static a region's landmarks built:
 * every mesh marked userData.bake is merged with the others on the same
 * material. The landmarks are a handful of meshes each, and seven of them
 * in the Upper Geyser Basin were forty draw calls with the ink prepass
 * drawing each opaque one twice. A baked mesh culls as one, which costs
 * nothing that matters at the size of a basin.
 */
export function bakeByMaterial(group) {
  const buckets = new Map();
  group.traverse((o) => {
    if (o.isMesh && o.userData.bake && !o.isInstancedMesh) {
      if (!buckets.has(o.material)) {
        buckets.set(o.material, []);
      }
      buckets.get(o.material).push(o);
    }
  });
  let merged = 0;
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) {
      continue;
    }
    const geos = meshes.map((m) => {
      m.updateWorldMatrix(true, false);
      const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) {
      continue;
    }
    for (const g of geos) {
      g.dispose();
    }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `baked-${meshes.map((m) => m.name).join('+')}`;
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    group.add(mesh);
    merged += meshes.length - 1;
  }
  return merged;
}
