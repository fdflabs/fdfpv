/*
 * index.js: Yellowstone's rivers and lakes, from hydro.json.
 *
 *   const water = buildWater({ scene, heightAt, hydro: json, clock, wind });
 *   water.loadRegion(region) / unloadRegion(key)   the rivers of a region
 *   water.surfaceAt(x, z)                           a lake's y, or null
 *
 * Lakes are built at once and stay: they are flat at their surface, need no
 * ground under them to be right, and Yellowstone Lake has to read from
 * three kilometres up and thirty away. Rivers are built per region on the
 * drape grid, where the engine draws its finest level, so they lie exactly
 * on the ground it draws (see ../thermal/grid.js), their banks cut per
 * pixel from the signed distance to the channel's centre line.
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
import { readHydro, riverCorridor, inLake, BANK } from './hydro.js';
import { buildCells } from '../thermal/grid.js';
import { paintMaterial, LAYER } from '../thermal/paint.js';
import { SteamBuilder } from '../thermal/steam.js';
import { rngFrom } from '../thermal/springs.js';
import { buildLakes } from './lakes.js';

/* The drape grid the rivers are laid on. 10 m is the hero tiles' cell and
 * refines level 0's thirty; the banks are cut per pixel, so a finer grid
 * would buy nothing but triangles. */
const STEP = 10;

export function riverMaterial() {
  return paintMaterial({
    key: 'river',
    attrs: ['vec4 aRiver'],
    bias: LAYER.water,
    cel: { rim: 0.2, rimColor: 0xdfeeff },
    body: /* glsl */ `
      float a = abs(vRiver.x);
      vec2 w = vCelWorld.xz;
      float ragged = (ysNoise(w * 0.35) - 0.5) * 0.12;
      if (a > 1.0 + ${BANK.toFixed(3)} + ragged) {
        discard;
      }
      vec3 deep = ysRgb(0.16, 0.34, 0.40);
      vec3 shallow = ysRgb(0.36, 0.54, 0.52);
      vec3 warm = ysRgb(0.30, 0.55, 0.56);
      vec3 bank = ysRgb(0.42, 0.39, 0.31);
      float edge = smoothstep(0.35, 1.0, a);
      paint = mix(deep, shallow, edge);
      paint = mix(paint, warm, vRiver.w * 0.6);
      /* Riffles and rapids: streaks carried down the flow, thicker where
       * the bed falls faster. */
      float fall = clamp(vRiver.z * 12.0, 0.0, 1.0);
      float streak = ysNoise(vec2(vRiver.y * 0.12 - uCelTime * 1.6, vRiver.x * 3.0 + 2.0));
      float foam = smoothstep(0.78 - 0.4 * fall, 0.92 - 0.3 * fall, streak) * (0.25 + 0.75 * fall);
      foam = max(foam, smoothstep(0.82, 0.98, a) * 0.55);
      paint = mix(paint, ysRgb(0.93, 0.96, 0.97), clamp(foam, 0.0, 1.0));
      /* The wet bank: gravel and mud just past the water's edge. */
      float onBank = step(1.0 + ragged * 0.5, a);
      paint = mix(paint, bank * (0.85 + 0.25 * ysNoise(w * 0.9)), onBank);
    `,
  });
}

export function buildWater({ scene, heightAt, hydro, sunDir, clock, wind, warmAt, drawnBy }) {
  const data = readHydro(hydro);
  /* NHD maps some hot springs as lakes (Excelsior Geyser Crater, Grand
   * Prismatic's pool): where a landmark draws its own water, drawnBy(lake)
   * says so and the lake is left to it, or there would be two surfaces. */
  const skipped = drawnBy ? data.lakes.filter((l) => drawnBy(l)) : [];
  if (skipped.length) {
    data.lakes = data.lakes.filter((l) => !skipped.includes(l));
  }
  const root = new THREE.Group();
  root.name = 'water';
  scene.add(root);
  const env = {
    clock: clock ?? { value: 0 },
    wind: wind ?? { value: new THREE.Vector2(2.2, -1.6) },
    sunDir: sunDir ?? new THREE.Vector3(0.45, 0.62, 0.64).normalize(),
  };
  env.windSpeed = () => env.wind.value.length();
  const lakes = buildLakes(data.lakes);
  root.add(lakes.group);
  const riverMat = riverMaterial();
  const regions = new Map();

  function loadRegion(region) {
    if (regions.has(region.key)) {
      return regions.get(region.key).stats;
    }
    const rivers = data.regions.get(region.key) ?? [];
    const group = new THREE.Group();
    group.name = `water-${region.key}`;
    const stats = { rivers: rivers.length, cells: 0, triangles: 0, steam: 0 };
    if (rivers.length) {
      const box = { x0: region.x0, z0: region.z0, x1: region.x1, z1: region.z1 };
      const corridor = riverCorridor(rivers, box, STEP);
      const built = buildCells(corridor.set, (x, z, out) => {
        const n = corridor.across(x, z);
        const y = heightAt(x, z);
        if (!n) {
          out.aRiver = [9, 0, 0, 0];
          return y;
        }
        /* The bed's fall along the flow over ten metres, for the rapids. */
        const fall = (heightAt(x - n.dx * 5, z - n.dz * 5) - heightAt(x + n.dx * 5, z + n.dz * 5)) / 10;
        out.aRiver = [n.v, n.along, Math.max(0, fall), warmAt ? warmAt(x, z) : 0];
        return y;
      }, { aRiver: 4 });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
      geo.setAttribute('aRiver', new THREE.BufferAttribute(built.attrs.aRiver, 4));
      geo.setIndex(new THREE.BufferAttribute(built.index, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, riverMat);
      mesh.name = 'rivers';
      mesh.receiveShadow = true;
      group.add(mesh);
      stats.cells = corridor.set.size;
      stats.triangles = built.triangles;
      /* Where a river runs through a geyser basin its water is warm and
       * it steams: the Firehole through the Upper and Midway basins. */
      if (warmAt) {
        const steam = new SteamBuilder();
        const rng = rngFrom(region.i * 97 + region.j * 13 + 5);
        for (const r of rivers) {
          for (let i = 1; i < r.points.length; i += 1) {
            const a = r.points[i - 1];
            const b = r.points[i];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            for (let s = 0; s < len; s += 70) {
              const x = a.x + ((b.x - a.x) * s) / len;
              const z = a.z + ((b.z - a.z) * s) / len;
              if (x < box.x0 || x >= box.x1 || z < box.z0 || z >= box.z1) {
                continue;
              }
              const warm = warmAt(x, z);
              if (warm < 0.45) {
                continue;
              }
              /* Low and ragged: warm water steams in a sheet that the
               * air takes a few metres up, not in columns. */
              steam.vent({ x, y: heightAt(x, z) + 0.3, z, spread: a.w * 0.5, count: 1 + Math.round(warm * 2), size: 5 + a.w * 0.15, rise: 2 + 3 * warm, life: 10, alpha: 0.12 + 0.14 * warm, rng });
            }
          }
        }
        /* Eighty faces a puff: at twenty a flattened puff over the water
         * showed as a hexagonal flake. */
        const sm = steam.build(env, { detail: 1, name: 'river-steam', squash: 0.35 });
        if (sm) {
          group.add(sm);
          stats.steam = steam.count;
        }
      }
    }
    root.add(group);
    regions.set(region.key, { group, stats });
    return stats;
  }

  function unloadRegion(key) {
    const e = regions.get(key);
    if (!e) {
      return;
    }
    root.remove(e.group);
    e.group.traverse((o) => {
      if (o.geometry) {
        o.geometry.dispose();
      }
      if (o.material && o.material.userData.particles) {
        o.material.dispose();
      }
    });
    regions.delete(key);
  }

  return {
    root,
    counts: { ...data.counts, lakeTriangles: lakes.triangles, lakesLeftToLandmarks: skipped.map((l) => l.name ?? l.id) },
    loadRegion,
    unloadRegion,
    updateAnim(stepMs) {
      env.clock.value = stepMs * 0.001;
    },
    /* The water a craft lands on, for the engine's height(): a lake's
     * surface where (x, z) is on a lake, else null. */
    surfaceAt(x, z) {
      for (const l of data.lakes) {
        if (inLake(l, x, z)) {
          return l.y;
        }
      }
      return null;
    },
    dispose() {
      for (const key of [...regions.keys()]) {
        unloadRegion(key);
      }
      scene.remove(root);
      lakes.group.traverse((o) => o.geometry && o.geometry.dispose());
      riverMat.dispose();
      lakes.material.dispose();
    },
  };
}
