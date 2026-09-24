/*
 * aircraft.js: the Cub on the apron, near.
 *
 * The cel Cub's shape (alps/vehicles.js), finished as a Cub is: doped
 * fabric in Cub yellow with the black flash down the fuselage, a Swiss
 * registration on the sides, glass you see the two tandem seats and the
 * stick through, the tyres black rubber.
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

import { buildAircraft as celAircraft } from '../../alps/vehicles.js';
import { makeKit, FIN, fin, refinish, box } from './kit.js';

const NEAR = 60;
/* The Cub stands eleven degrees nose up on its tailwheel (the cel
 * builder's pitch); the parts here are authored level and turned with it. */
const PITCH = 0.19;

/* Dope on fabric: glossy, but not a car's lacquer. */
export const dope = (c) => fin(c, 0.42, 0, 0.5);

export function aircraft() {
  const G = makeKit();
  const K = refinish({ list: [celAircraft().geometry] }, { glass: G, paint: dope });
  const X = makeKit();
  /* The black flash along the fuselage, the registration, the seats and
   * the stick inside. */
  for (const t of [-1, 1]) {
    X.push(FIN.trim, box(2.9, 0.07, 0.01), 1.1, 1.3, t * 0.408);
    X.push(FIN.trim, box(1.2, 0.05, 0.01), 2.5, 1.36, t * 0.376);
    for (let k = 0; k < 5; k += 1) {
      X.push(FIN.trim, box(0.16, 0.24, 0.01), -0.6 - k * 0.24, 1.5, t * (0.4 - k * 0.018));
    }
  }
  for (const x of [1.25, 0.45]) {
    X.push(FIN.seat, box(0.4, 0.08, 0.5), x, 1.2, 0);
    X.push(FIN.seat, box(0.08, 0.55, 0.5), x - 0.22, 1.45, 0, 0, 0, 0.2);
  }
  X.push(FIN.trim, box(0.03, 0.5, 0.03), 1.55, 1.3, 0, 0, 0, -0.2);
  const extras = X.bake();
  extras.rotateZ(PITCH);
  K.pushBaked(extras);
  extras.dispose();
  return { body: K, glass: G, lod: NEAR };
}
