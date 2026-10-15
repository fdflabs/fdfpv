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
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { celMaterial } from '../../render/celmat.js';
import { partsMaterial } from '../../render/library/vehicles/parts.js';
import { canvasTexture, STRIP_W } from './terrain.js';

/*
 * The strip as a mown grass runway: lanes two metres wide down its length
 * cut alternately towards and away from the threshold, the grass a little
 * longer and darker along both edges, the two ruts the wheels wear either
 * side of the centreline, and a grain of clover and bare earth. A plain
 * colour read at the race start as a flat green trapezoid, the one thing
 * in the frame with no scale in it. One canvas, a texel 19 cm across and
 * 31 cm along, so a lane is ten texels and keeps its edge down the mips.
 */
function stripTexture() {
  const W = 64;
  const H = 512;
  return canvasTexture(W, H, (ctx) => {
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const lane = W / (STRIP_W / 2);
    for (let j = 0; j < H; j += 1) {
      for (let i = 0; i < W; i += 1) {
        const across = ((i + 0.5) / W - 0.5) * STRIP_W;
        let r = 0x8f;
        let g = 0xb0;
        let b = 0x4a;
        const light = Math.floor(i / lane) % 2 === 0;
        const t = light ? 1.06 : 0.93;
        r *= t;
        g *= t;
        b *= t;
        /* The longer grass at the edges, half a metre in. */
        const edge = Math.max(0, 1 - (STRIP_W / 2 - Math.abs(across)) / 0.6);
        r *= 1 - 0.14 * edge;
        g *= 1 - 0.08 * edge;
        b *= 1 - 0.16 * edge;
        /* The wheel ruts, 1.1 m either side of the centreline. */
        const rut = Math.max(0, 1 - Math.abs(Math.abs(across) - 1.1) / 0.35);
        r += (0xa2 - r) * 0.22 * rut;
        g += (0xa0 - g) * 0.22 * rut;
        b += (0x62 - b) * 0.22 * rut;
        let h = Math.imul(i + 11, 374761393) ^ Math.imul(j + 7, 668265263);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const n = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        const grain = 1 + (n - 0.5) * 0.08;
        r *= grain;
        g *= grain;
        b *= grain;
        if (n > 0.993) {
          r += (0xc8 - r) * 0.45;
          g += (0xc6 - g) * 0.45;
          b += (0xa8 - b) * 0.45;
        }
        const k = (j * W + i) * 4;
        px[k] = r;
        px[k + 1] = g;
        px[k + 2] = b;
        px[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* What the cel look says of a surface by name, over the options the
 * builder passed; a name not here is drawn as the options say. */
const BY_NAME = {
  strip: (opts) => ({ ...opts, color: 0xffffff, map: stripTexture(), key: 'alps-strip' }),
};

export const CEL_LOOK = {
  style: 'cel',
  material: (name, opts) => celMaterial(BY_NAME[name] ? BY_NAME[name](opts) : opts),
  parts: (name, opts) => partsMaterial(opts),
};
