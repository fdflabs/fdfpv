/*
 * look.js: where the valley's builders get their materials.
 *
 * The valley is drawn in more than one style from the same shapes: the
 * cel Alps, and the photographic valley in src/maps/swiss2. So a builder
 * does not make its own material. It asks the look it was handed in
 * ctx.look, by a name that says what the surface is and with the cel
 * options that are the cel style's whole answer:
 *
 *   look.material(name, opts)   a surface: celMaterial(opts) in the cel look
 *   look.parts(name, opts)      a vertex coloured bake: partsMaterial(opts)
 *
 * The name is what another look keys on, and the cel look ignores it, so
 * the cel valley is built from exactly the materials it was built from
 * before this file existed. The village's own materials come the same way
 * in spirit, as the ctx.mats table keyed by surface.
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

import { celMaterial } from '../../render/celmat.js';
import { partsMaterial } from './parts.js';

export const CEL_LOOK = {
  style: 'cel',
  material: (name, opts) => celMaterial(opts),
  parts: (name, opts) => partsMaterial(opts),
};
