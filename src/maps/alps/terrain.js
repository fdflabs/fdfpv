/*
 * terrain.js: the valley's ground: its shape, its paint, its mesh and the
 * range beyond it.
 *
 * One analytic valley sampled into a heightfield that the mesh, the
 * colour, the tree line and the shell's physics plane all read. Nothing
 * here is placed on the ground; that is the other modules' business.
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

import * as THREE from 'three';
import { celMaterial } from '../../render/celmat.js';
import { fbm, noise2, smoothstep } from '../../render/library/noise.js';
import {
  CELLS, FIELD, HALF, POOL, SIDE_Z, streamX, terrainHeight, valleyAxis,
} from './heights.js';
import { groundZone } from '../../share/valley/world.js';

/* The shape lives in heights.js and what the ground is in
 * share/valley/world.js, so the room server can read them; every importer
 * of this file still finds them here. */
export * from './heights.js';
export { groundZone };

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* The paths the paint draws on the ground, as polylines in metres: the
 * track along the stream from the bridge to the lake, the track up the
 * side valley to the pool, and a hiker's zigzag up the west wall from
 * the church. Drawn as canvas strokes over the texels, which is the one
 * cheap way to put a two metre line on a three metre texel. */
export function groundPaths() {
  const stream = [];
  for (let z = 115; z <= 1330; z += 40) {
    stream.push({ x: streamX(z) + 7, z });
  }
  const side = [];
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16;
    const z = SIDE_Z + 60 * Math.sin(t * 5) - 10 * t;
    const dx = 75 + t * (POOL.dx - 30 - 75);
    side.push({ x: valleyAxis(z) + dx + 12 * Math.sin(t * 9), z });
  }
  const zigzag = [{ x: -250, z: 112 }];
  for (let k = 1; k <= 8; k += 1) {
    zigzag.push({ x: -250 - k * 95, z: 112 + (k % 2 === 0 ? 40 : -140) });
  }
  return [stream, side, zigzag];
}

/*
 * The ground's colour, painted from the same terrain, a texel every
 * four metres: meadow on the floor with mown stripes on the village
 * plateau and hayfield patches beyond it, pasture with flowers above,
 * the forest floor under the trees, scree fanning out below the cliffs,
 * rock with its strata on the steep faces, snow with wind lines on the
 * ridges, gravel round the lake with silt under the shallows, and the
 * paths stroked on top.
 *
 * Two passes. The zones are mixed once per block of six texels,
 * twenty three metres, where the slope, the forest and the noise are
 * read, because nothing they drive is finer than the thirty metre
 * heightfield and the ten noise reads a block are most of the cost;
 * the texels then read the block colour bilinearly and add only what
 * is finer than a block: the strata, the stripes, the wind lines and
 * the flower speckle. Measured in headless Chrome on this box: the
 * texel pass doing the zone mixing itself was over 600 ms, blocks of
 * four texels were 210 to 230 ms of blocks and 285 to 320 ms of
 * texels, and this is what fits the build budget. One canvas, one
 * keyed texture: the cel material takes a map and nothing else, so a
 * second tiling detail texture would mean a change to celmat.js's
 * shader, and that is not this file's to make.
 */
export function groundTexture(field) {
  const PX = 1536;
  const PER = 6;
  const BLOCKS = PX / PER;
  const step = FIELD / PX;
  const bstep = FIELD / BLOCKS;

  const meadow = [0x6f, 0x9a, 0x3e];
  const hay = [0x82, 0xa3, 0x44];
  const pasture = [0x8c, 0xa6, 0x4f];
  const flowers = [0xa4, 0xb3, 0x58];
  const forest = [0x3a, 0x59, 0x2c];
  const scree = [0x9c, 0x99, 0x92];
  const screeDark = [0x83, 0x80, 0x7a];
  const rock = [0x6c, 0x6d, 0x6c];
  const snow = [0xf4, 0xf6, 0xfa];
  const gravel = [0xb6, 0xb0, 0xa1];
  const silt = [0x98, 0xab, 0x86];
  const bed = [0x2d, 0x55, 0x58];
  const lerp3 = (out, b, t) => {
    out[0] += (b[0] - out[0]) * t;
    out[1] += (b[1] - out[1]) * t;
    out[2] += (b[2] - out[2]) * t;
  };

  /* Per block: the zone colour and the weights the texels finish with. */
  const nb = BLOCKS * BLOCKS;
  const bCol = new Float32Array(nb * 3);
  const bFaces = new Float32Array(nb);
  const bSnowy = new Float32Array(nb);
  const bFlat = new Float32Array(nb);
  const bBloom = new Float32Array(nb);
  const bGrain = new Float32Array(nb);
  const bPatch = new Float32Array(nb);
  const c = [0, 0, 0];
  const zone = {};
  for (let j = 0; j < BLOCKS; j += 1) {
    const z = -HALF + (j + 0.5) * bstep;
    for (let i = 0; i < BLOCKS; i += 1) {
      const x = -HALF + (i + 0.5) * bstep;
      const k = j * BLOCKS + i;
      groundZone(field, x, z, bstep, zone);
      bGrain[k] = zone.grain;
      bPatch[k] = zone.patch;
      bFlat[k] = zone.flat;

      c[0] = meadow[0];
      c[1] = meadow[1];
      c[2] = meadow[2];
      lerp3(c, hay, zone.hay * (1 - zone.up));
      lerp3(c, pasture, zone.up);
      bBloom[k] = zone.bloom;
      lerp3(c, flowers, zone.bloom);
      lerp3(c, forest, zone.forest * 0.9);
      if (zone.scree > 0.02) {
        lerp3(c, zone.screeLight ? scree : screeDark, zone.scree);
      }
      lerp3(c, rock, zone.rock);
      bFaces[k] = zone.faces;
      bSnowy[k] = zone.snow;
      lerp3(c, snow, zone.snow);
      if (zone.lake) {
        lerp3(c, gravel, zone.shore);
        lerp3(c, silt, zone.silt * zone.shore);
        lerp3(c, bed, zone.bed * zone.shore);
      }
      const tone = 1 + 0.04 * zone.grain;
      bCol[k * 3] = c[0] * tone;
      bCol[k * 3 + 1] = c[1] * tone;
      bCol[k * 3 + 2] = c[2] * tone;
    }
  }
  const paths = groundPaths();

  return canvasTexture(PX, PX, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const px = img.data;
    const last = BLOCKS - 1;
    /* Which two blocks a texel sits between along x, and how far, worked
     * out once per column rather than four million times. */
    const col0 = new Int32Array(w);
    const col1 = new Int32Array(w);
    const colF = new Float32Array(w);
    const colN = new Int32Array(w);
    for (let i = 0; i < w; i += 1) {
      const u = Math.max(0, Math.min(last, (i + 0.5) / PER - 0.5));
      col0[i] = Math.floor(u);
      col1[i] = Math.min(last, col0[i] + 1);
      colF[i] = u - col0[i];
      colN[i] = colF[i] < 0.5 ? col0[i] : col1[i];
    }
    for (let j = 0; j < h; j += 1) {
      const z = -HALF + (j + 0.5) * step;
      const v = Math.max(0, Math.min(last, (j + 0.5) / PER - 0.5));
      const j0 = Math.floor(v);
      const j1 = Math.min(last, j0 + 1);
      const fv = v - j0;
      const row0 = j0 * BLOCKS;
      const row1 = j1 * BLOCKS;
      const rowN = fv < 0.5 ? row0 : row1;
      for (let i = 0; i < w; i += 1) {
        const x = -HALF + (i + 0.5) * step;
        const fu = colF[i];
        const k00 = (row0 + col0[i]) * 3;
        const k10 = (row0 + col1[i]) * 3;
        const k01 = (row1 + col0[i]) * 3;
        const k11 = (row1 + col1[i]) * 3;
        const w00 = (1 - fu) * (1 - fv);
        const w10 = fu * (1 - fv);
        const w01 = (1 - fu) * fv;
        const w11 = fu * fv;
        let r = bCol[k00] * w00 + bCol[k10] * w10 + bCol[k01] * w01 + bCol[k11] * w11;
        let g = bCol[k00 + 1] * w00 + bCol[k10 + 1] * w10 + bCol[k01 + 1] * w01 + bCol[k11 + 1] * w11;
        let b = bCol[k00 + 2] * w00 + bCol[k10 + 2] * w10 + bCol[k01 + 2] * w01 + bCol[k11 + 2] * w11;
        /* The nearest block's weights are enough for what follows: a
         * stripe or a stratum edge crossing a block boundary is not a
         * thing anyone sees. */
        const kn = rowN + colN[i];
        const snowy = bSnowy[kn];
        const faces = bFaces[kn] * (1 - snowy);
        if (faces > 0.02) {
          /* Strata: bands thirty metres tall, warped a little by the
           * grain so they never read as contour lines, a dark one and a
           * light one to every four. */
          const y = field.height(x, z);
          const band = ((y + 16 * bGrain[kn] + 8 * bPatch[kn]) / 30) % 1;
          if (band < 0.2) {
            const t = 0.16 * faces;
            r *= 1 - t;
            g *= 1 - t;
            b *= 1 - t;
          } else if (band > 0.6 && band < 0.76) {
            const t = 0.1 * faces;
            r *= 1 + t;
            g *= 1 + t;
            b *= 1 + t;
          }
        }
        if (snowy > 0.3) {
          /* Wind lines combed across the snow from the south west. */
          const wind = noise2((x - z) / 5.2, (x + z) / 260 + 4.4);
          if (wind > 0.56) {
            const t = 0.07 * snowy;
            r *= 1 - t;
            g *= 1 - t * 0.6;
            b *= 1 - t * 0.2;
          }
        }
        const flat = bFlat[kn];
        if (flat > 0.02) {
          /* Mown fields, a hundred and twenty five metres square, each
           * striped one way or the other or left long, five texels to a
           * stripe. One set of stripes over the whole plateau converged
           * on the vanishing point and read from the air as a fan of
           * light rays; a stripe that is not a whole number of texels
           * wide beats between two and three texel bands. */
          let fh = Math.imul((i >> 5) + 7, 73856093) ^ Math.imul((j >> 5) + 3, 19349663);
          fh = (Math.imul(fh ^ (fh >>> 13), 1274126177) >>> 0) % 3;
          if (fh > 0) {
            const lane = fh === 1 ? i : j;
            const t = 1 + (Math.floor(lane / 5) % 2 === 0 ? 0.035 : -0.03) * flat;
            r *= t;
            g *= t;
            b *= t;
          }
        }
        const bloom = bBloom[kn];
        if (bloom > 0.05) {
          /* Yellow and white speckle in the flower patches. */
          let hsh = (i * 374761393 + j * 668265263) | 0;
          hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
          const speck = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967296;
          if (speck > 0.93) {
            const t = bloom * 0.55;
            const white = speck > 0.985;
            r += ((white ? 0xf2 : 0xe9) - r) * t;
            g += ((white ? 0xf2 : 0xd8) - g) * t;
            b += ((white ? 0xe6 : 0x62) - b) * t;
          }
        }
        const k = (j * w + i) * 4;
        px[k] = r;
        px[k + 1] = g;
        px[k + 2] = b;
        px[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    /* The paths, stroked over the texels. The canvas's y runs with z. */
    ctx.strokeStyle = '#b8ad95';
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    for (const path of paths) {
      ctx.beginPath();
      path.forEach((p, k) => {
        const u = (p.x + HALF) / step;
        const v = (p.z + HALF) / step;
        if (k === 0) {
          ctx.moveTo(u, v);
        } else {
          ctx.lineTo(u, v);
        }
      });
      ctx.stroke();
    }
  });
}

/* The terrain's geometry from the heightfield, a plane on its side with
 * every vertex lifted, normals computed so the shading reads the relief.
 * Every look draws this one shape, because it is the shape the craft
 * lands on. */
export function terrainGeometry(field) {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, field.height(pos.getX(k), pos.getZ(k)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* The cel look's terrain: the geometry under the painted ground. */
export function terrainMesh(field, tex) {
  const mesh = new THREE.Mesh(terrainGeometry(field), celMaterial({ color: 0xffffff, rim: 0.12, map: tex, key: 'alps-ground' }));
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * THE RANGE BEYOND. The valley's own field ends at three kilometres, and
 * a valley in the Alps does not: past every ridge there is a higher one.
 * A coarse ring of peaks, twenty four kilometres across, snow above the
 * rock, stands outside the field to fill the horizon. It has no collider
 * and nothing lands on it; the fog takes it before the field's edge is
 * noticed, and the sky dome takes it before the far plane does.
 */
/*
 * The ranges beyond the valley, drawn from `far`, the grid the world's
 * ground reads (src/share/valley/world.js farGrid), vertex for vertex, so
 * what stops a craft is what is drawn. Returns the mesh and that grid's
 * height sampler.
 */
export function farRange(far, look) {
  const geo = new THREE.PlaneGeometry(far.size, far.size, far.n, far.n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, far.data[k]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const normal = geo.getAttribute('normal');
  const colour = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x7d7b77);
  const darkRock = new THREE.Color(0x5e5c5a);
  const snow = new THREE.Color(0xf4f6fa);
  const green = new THREE.Color(0x4f7a3a);
  const forest = new THREE.Color(0x2f4a26);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const h = far.data[k];
    /* How steep the face is, 0 flat to 1 sheer: snow lies on the ledges
     * and the shoulders and slides off the faces, and a steep face is
     * bare rock well under the tree line, so the far peaks read by their
     * ridges rather than as one smooth height gradient. */
    const steep = 1 - normal.getY(k);
    const t = smoothstep(1300, 1900, h + 200 * fbm(x / 900, z / 900, 2)) * (1 - smoothstep(0.18, 0.3, steep));
    /* The lower slopes in forest and pasture, as the valley's own are. */
    c.copy(green).lerp(forest, smoothstep(0.38, 0.55, fbm(x / 600 + 4.2, z / 600 + 1.3, 2)) * (1 - smoothstep(450, 750, h)));
    c.lerp(rock, Math.max(smoothstep(450, 1000, h), smoothstep(0.12, 0.22, steep)));
    c.lerp(darkRock, smoothstep(0.2, 0.35, steep) * smoothstep(300, 900, h) * 0.8);
    /* Light and dark buttresses a few hundred metres across, so a face a
     * kilometre wide is not one flat grey. */
    c.multiplyScalar(1 + 0.22 * fbm(x / 450 + 7.1, z / 450 + 2.9, 2));
    c.lerp(snow, t);
    colour[k * 3] = c.r;
    colour[k * 3 + 1] = c.g;
    colour[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  const mesh = new THREE.Mesh(geo, look.parts('far-range', { rim: 0.1 }));
  mesh.name = 'far-range';
  return { mesh, height: far.height };
}
