/*
 * vehicles/: the photographic valley's PostAuto, cars, tractor, trailer,
 * motorbike and aircraft.
 *
 *   swissVehicles() -> what alps/life.js takes from a style's look.vehicles
 *
 * What drives and where is life.js's and stays it: the same paths, the
 * same timetable, the same moving boxes and parked colliders, because
 * every builder here returns the cel builder's own size and wheels (it
 * calls the cel builder for them). What changes is how a vehicle is
 * made and drawn.
 *
 * Two levels each. Near, a vehicle is modelled as a real one is built
 * (bus.js, cars.js, farm.js, aircraft.js): a swept body with its panels'
 * shut lines, glass you can see the seats through, lamps, plates,
 * mirrors, tyres with their shoulders and rims with spokes. Past its
 * near distance it is the cel vehicle's own shape with the photographic
 * finishes on it (kit.js refinish), which at a hundred metres is all a
 * car is. Both levels draw with the same two materials (materials.js),
 * so a car coming into range compiles nothing mid flight.
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
import {
  PAINT, buildCar as celCar, buildPostbus as celBus, buildTractor as celTractor, buildTrailer as celTrailer,
  buildMotorbike as celMotorbike, buildAircraft as celAircraft,
} from '../../alps/vehicles.js';
import { makeKit, placeKit, refinish, farWheel, nearWheel } from './kit.js';
import { vehicleMaterials } from './materials.js';
import { postbus } from './bus.js';
import { car } from './cars.js';
import { tractor, trailer, motorbike } from './farm.js';
import { aircraft, dope } from './aircraft.js';

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();

/* A kit baked into a mesh, or nothing if it is empty. */
function meshOf(K, mat, name, cast) {
  if (!K.list.length) {
    return null;
  }
  const m = new THREE.Mesh(K.bake(), mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = cast;
  return m;
}

/* The cel paints are chosen to read through a cel ramp; a real car park
 * is duller. Each cel colour, as a car's paint is. */
const PAINTS = new Map([
  [PAINT.white, 0xe4e5e2],
  [PAINT.silver, 0x9ea3a8],
  [PAINT.red, 0x8e1d18],
  [PAINT.blue, 0x1d2e52],
  [PAINT.anthracite, 0x34373c],
  [PAINT.green, 0x28402f],
]);
const paintOf = (c) => PAINTS.get(c) ?? c;

export function swissVehicles() {
  const mats = vehicleMaterials();
  const wheels = { far: farWheel(), alloy: nearWheel('alloy'), steel: nearWheel('steel', 0.6), tractor: nearWheel('lug', 0.55) };

  /* A cel build made photographic: its size and wheels as they are, its
   * shape refinished for the far level, and the near model's parts. */
  const make = (cel, near) => ({
    size: cel.size,
    wheels: cel.wheels,
    far: refinish(cel.parts),
    near: near.body,
    glass: near.glass,
    wheel: wheels[near.wheel ?? 'alloy'],
    lod: near.lod,
  });

  return {
    buildCar: (kind, colour) => make(celCar(kind, paintOf(colour)), car(kind, paintOf(colour))),
    buildPostbus: () => make(celBus(), postbus()),
    buildTractor: () => make(celTractor(), tractor()),
    buildTrailer: () => make(celTrailer(), trailer()),
    buildMotorbike: (colour) => make(celMotorbike(paintOf(colour)), motorbike(paintOf(colour))),

    /* A vehicle that moves: a LOD of its two levels, each with its body
     * and its wheels as an instanced mesh whose matrices carry the spin,
     * the near one with its glass. */
    mover(built) {
      const group = new THREE.Group();
      group.rotation.order = 'YZX';
      const lod = new THREE.LOD();
      const levels = [];
      for (const [kit, glass, wheelGeo] of [[built.near, built.glass, built.wheel], [built.far, null, wheels.far]]) {
        const level = new THREE.Group();
        const body = meshOf(kit, mats.body, 'body', true);
        level.add(body);
        const see = glass && meshOf(glass, mats.glass, 'glass', false);
        if (see) {
          level.add(see);
        }
        /* A near wheel's shadow is under the body's own; only the far
         * wheels cast. */
        const inst = new THREE.InstancedMesh(wheelGeo, mats.body, built.wheels.length);
        inst.castShadow = !glass;
        inst.receiveShadow = true;
        level.add(inst);
        levels.push({ level, inst });
      }
      lod.addLevel(levels[0].level, 0);
      lod.addLevel(levels[1].level, built.lod);
      group.add(lod);
      const rolled = (dist) => {
        built.wheels.forEach((w, i) => {
          M.makeTranslation(w.x, w.r, w.z);
          M.multiply(M2.makeRotationZ(-dist / w.r));
          M.multiply(M2.makeScale(w.r, w.r, w.w));
          for (const { inst } of levels) {
            inst.setMatrixAt(i, M);
          }
        });
        for (const { inst } of levels) {
          inst.instanceMatrix.needsUpdate = true;
        }
      };
      rolled(0);
      /* The wheels only spin about their own axles, so a sphere taken
       * off the first matrices, with a margin, holds them for ever. */
      for (const { inst } of levels) {
        inst.computeBoundingSphere();
        inst.boundingSphere.radius += 0.5;
      }
      return { group, rolled, size: built.size };
    },

    /* Everything that stands still in one place, wheels baked in: a LOD
     * of the near bake with its glass and the far one, centred on the
     * row so the distance is the camera's to the row. */
    parked(name) {
      const near = makeKit();
      const nearWheels = makeKit();
      const glass = makeKit();
      const far = makeKit();
      const box = new THREE.Box3();
      let lodAt = 0;
      return {
        add(built, x, y, z, yaw) {
          const spun = makeKit();
          for (const w of built.wheels) {
            spun.pushBaked(built.wheel, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w);
            built.far.pushBaked(wheels.far, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w);
          }
          placeKit(nearWheels, spun, x, y, z, yaw);
          placeKit(near, built.near, x, y, z, yaw);
          placeKit(glass, built.glass, x, y, z, yaw);
          placeKit(far, built.far, x, y, z, yaw);
          box.expandByPoint(new THREE.Vector3(x, y, z));
          lodAt = Math.max(lodAt, built.lod);
        },
        mesh() {
          const centre = box.getCenter(new THREE.Vector3());
          const radius = box.getSize(new THREE.Vector3()).length() / 2;
          const lod = new THREE.LOD();
          lod.name = name;
          lod.position.copy(centre);
          const levels = [[near, nearWheels, glass], [far, null, null]].map(([k, w, g]) => {
            const level = new THREE.Group();
            for (const m of [
              meshOf(k, mats.body, `${name}-body`, true),
              w && meshOf(w, mats.body, `${name}-wheels`, false),
              g && meshOf(g, mats.glass, `${name}-glass`, false),
            ]) {
              if (m) {
                m.geometry.translate(-centre.x, -centre.y, -centre.z);
                m.receiveShadow = true;
                level.add(m);
              }
            }
            return level;
          });
          lod.addLevel(levels[0], 0);
          lod.addLevel(levels[1], radius + lodAt);
          return lod;
        },
      };
    },

    /* The aircraft on the apron: it never moves, so its wheels are
     * parts, as the cel one's are. */
    aircraft() {
      const cel = celAircraft();
      const near = aircraft();
      const far = refinish({ list: [cel.geometry] }, { paint: dope });
      const lod = new THREE.LOD();
      const nearLevel = new THREE.Group();
      nearLevel.add(meshOf(near.body, mats.body, 'aircraft-body', true));
      const see = meshOf(near.glass, mats.glass, 'aircraft-glass', false);
      if (see) {
        nearLevel.add(see);
      }
      const farLevel = new THREE.Group();
      farLevel.add(meshOf(far, mats.body, 'aircraft-far', true));
      lod.addLevel(nearLevel, 0);
      lod.addLevel(farLevel, near.lod);
      return { object: lod, size: cel.size };
    },
  };
}
