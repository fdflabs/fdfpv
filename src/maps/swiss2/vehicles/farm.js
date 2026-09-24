/*
 * farm.js: the tractor, its hay trailer and the motorbike, near.
 *
 * These are seen from the air or across a field, not from a pavement,
 * so near they keep the cel shape (alps/vehicles.js) and are finished
 * as what they are made of: the tractor's glass is glass you see the
 * seat and the wheel through, its tyres carry the lugs a field tyre
 * has, the bales are wrapped hay rather than yellow cylinders, and the
 * rider sits on a bike with a real tank, forks and a chain.
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
  buildTractor as celTractor, buildTrailer as celTrailer, buildMotorbike as celMotorbike,
} from '../../alps/vehicles.js';
import { makeKit, FIN, fin, refinish, box, cylZ } from './kit.js';

const NEAR = 45;

/* The cel parts refinished, their glass moved to the see through list. */
function split(celParts) {
  const glass = makeKit();
  return { body: refinish(celParts, { glass }), glass };
}

export function tractor() {
  const { body: K, glass: G } = split(celTractor().parts);
  /* The steering wheel on its column, the instrument pod, the mirrors. */
  const wheel = new THREE.TorusGeometry(0.2, 0.02, 4, 16);
  K.push(FIN.trim, wheel, -0.05, 2.05, 0, Math.PI / 2, 0, -0.7);
  wheel.dispose();
  K.push(FIN.trim, box(0.05, 0.4, 0.05), 0.05, 1.85, 0, 0, 0, -0.5);
  for (const t of [-1, 1]) {
    K.push(FIN.trim, box(0.03, 0.03, 0.4), 0.35, 2.7, t * 0.92);
    K.push(FIN.trim, box(0.04, 0.26, 0.16), 0.35, 2.55, t * 1.12);
    K.push(FIN.chrome, box(0.005, 0.22, 0.13), 0.33, 2.55, t * 1.12);
  }
  /* The number plate on the rear, the orange beacon on the roof. */
  K.push(FIN.plate, box(0.01, 0.12, 0.3), -1.66, 1.35, 0);
  K.push(fin(0xff7a10, 0.2, -1.5, 1), new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), -0.9, 3.08, 0.6);
  return { body: K, glass: G, wheel: 'tractor', lod: NEAR };
}

export function trailer() {
  const { body: K, glass: G } = split(celTrailer().parts);
  /* The bales' wrapped faces: a darker spiral read as rings on each end. */
  for (const x of [-1.15, 0.05, 1.25]) {
    for (const s of [-1, 1]) {
      const ring = new THREE.TorusGeometry(0.36, 0.035, 3, 16);
      K.push(fin(0xa8904a, 0.95), ring, x, 1.58, s * 0.6);
      ring.dispose();
    }
  }
  /* Side boards: the planks' lines. */
  for (const t of [-1, 1]) {
    for (const y of [1.12, 1.28, 1.42]) {
      K.push(fin(0x2a4a33, 0.7), box(3.56, 0.012, 0.01), 0, y, t * 0.955);
    }
  }
  return { body: K, glass: G, wheel: 'tractor', lod: NEAR };
}

export function motorbike(colour) {
  const { body: K, glass: G } = split(celMotorbike(colour).parts);
  /* The chain, the mirrors, the plate. */
  K.push(FIN.steel, box(1.0, 0.03, 0.02), -0.3, 0.45, 0.12, 0, 0, 0.05);
  for (const t of [-1, 1]) {
    K.push(FIN.trim, box(0.02, 0.2, 0.02), 0.45, 1.15, t * 0.3);
    K.push(FIN.chrome, box(0.04, 0.06, 0.09), 0.44, 1.27, t * 0.32);
  }
  K.push(FIN.plate, box(0.01, 0.13, 0.17), -0.88, 0.64, 0, 0, 0, -0.3);
  K.push(FIN.chrome, cylZ(0.06, 0.02, 10), 0.72, 0.32, 0.08);
  return { body: K, glass: G, wheel: 'alloy', lod: NEAR - 20 };
}
