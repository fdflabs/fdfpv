/*
 * terrain.js: the valley's ground: its shape, its paint, its mesh and the
 * range beyond it.
 *
 * One analytic valley sampled into a heightfield that the mesh, the
 * colour, the tree line and the shell's physics plane all read. Nothing
 * here is placed on the ground; that is the other modules' business.
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
import { celMaterial } from '../../render/celmat.js';
import { fbm, smoothstep } from './noise.js';

/* The heightfield: a square this many metres on a side, centred on the
 * origin, sampled on a grid this fine. Thirty metre cells are coarse for a
 * hillside under a landing wing, which is why the floor near the strip is
 * flattened analytically rather than trusted to the grid. */
export const FIELD = 6000;
export const HALF = FIELD / 2;
export const CELLS = 200;
export const CELL = FIELD / CELLS;

/* The valley runs along z. Its floor is this wide before the walls start,
 * the walls reach the ridge line this far out, and the ridge stands this
 * high over the floor before the peaks are put on it. The Lauterbrunnen
 * floor is about a kilometre wide with walls of the same height; this is
 * a little tighter so a wing sees both walls at once. */
export const FLOOR_HALF = 220;
export const WALL_REACH = 2100;
export const RIDGE = 1400;

/* The strip: grass, this long along the valley and this wide, at the
 * origin, and the village beside it. */
export const STRIP_L = 160;
export const STRIP_W = 12;
export const STRIP_Y = 0.02;

/* The lake fills the basin at the south end; its surface is a hair below
 * the meadow so the shore reads. */
export const LAKE_Z = 2150;
export const LAKE_Y = -1.5;

/* Snow from here up on the average, wandering a hundred and fifty metres
 * either way with the noise, and never on a face steeper than this. */
export const SNOW_LINE = 700;
export const SNOW_MAX_SLOPE = 1.6;


export function valleyAxis(z) {
  return 180 * Math.sin(z / 1500) + 60 * Math.sin(z / 430 + 1.2);
}

export function terrainHeight(x, z) {
  const axis = valleyAxis(z);
  const dx = x - axis;
  const across = Math.abs(dx);
  const wall = smoothstep(FLOOR_HALF, WALL_REACH, across);
  let h = Math.pow(wall, 1.35) * RIDGE;
  /* Peaks and shoulders on the walls, more the higher they stand. */
  h += (260 * fbm(x / 900, z / 900, 4) + 90 * fbm(x / 260, z / 260, 3)) * Math.pow(wall, 0.8);
  /* The side valley: a trough into the east wall a kilometre and a bit
   * north of the strip, deep where the wall is high. */
  if (dx > 0) {
    const t = Math.exp(-Math.pow((z + 1300) / 420, 2));
    h -= 0.55 * h * t;
  }
  /* The floor: pasture with a roll to it, and the lake basin at the
   * south end going below the water. */
  const floor = 1 - wall;
  h += floor * (7 * fbm(x / 300, z / 300, 3) + 3);
  const basin = smoothstep(LAKE_Z - 900, LAKE_Z - 150, z) * (1 - smoothstep(FLOOR_HALF + 150, FLOOR_HALF + 500, across));
  h -= basin * 22;
  /* The strip, the hangar and the village stand on ground held flat: a
   * plateau from the east apron to the church, longer than the strip. */
  const flat = (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  h = h * (1 - flat) + 0 * flat;
  return h;
}

/*
 * The heightfield the mesh and the collider read, sampled once from the
 * analytic terrain and read back bilinearly. Bilinear so the plane the
 * shell lays under the craft is continuous across a cell edge; a step
 * there would read as a kerb to a landing wing.
 */
export function buildHeightfield() {
  const n = CELLS + 1;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      data[j * n + i] = terrainHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }
  const at = (i, j) => data[Math.max(0, Math.min(CELLS, j)) * n + Math.max(0, Math.min(CELLS, i))];
  const height = (x, z) => {
    const u = (x + HALF) / CELL;
    const v = (z + HALF) / CELL;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    const h00 = at(i, j);
    const h10 = at(i + 1, j);
    const h01 = at(i, j + 1);
    const h11 = at(i + 1, j + 1);
    return (h00 + (h10 - h00) * fu) + ((h01 + (h11 - h01) * fu) - (h00 + (h10 - h00) * fu)) * fv;
  };
  return { data, n, height };
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/*
 * The ground's colour, painted from the same terrain: meadow on the floor,
 * pasture above it, pine on the lower slopes where they are not too
 * steep, rock where they are and above the trees, snow over the line on
 * anything that would hold it. One texel is six metres.
 */
export function groundTexture(field) {
  const PX = 1024;
  const step = FIELD / PX;
  return canvasTexture(PX, PX, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const px = img.data;
    const meadow = [0x6f, 0x9a, 0x3e];
    const pasture = [0x8f, 0xa8, 0x52];
    const pine = [0x2c, 0x54, 0x2a];
    const rock = [0x7a, 0x78, 0x74];
    const scree = [0x97, 0x94, 0x8c];
    const snow = [0xf3, 0xf5, 0xf9];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let j = 0; j < h; j += 1) {
      const z = -HALF + (j + 0.5) * step;
      for (let i = 0; i < w; i += 1) {
        const x = -HALF + (i + 0.5) * step;
        const y = field.height(x, z);
        const sx = (field.height(x + step, z) - field.height(x - step, z)) / (2 * step);
        const sz = (field.height(x, z + step) - field.height(x, z - step)) / (2 * step);
        const slope = Math.hypot(sx, sz);
        const grain = fbm(x / 80, z / 80, 2);
        let c = mix(meadow, pasture, smoothstep(60, 500, y));
        const treeBand = smoothstep(40, 120, y) * (1 - smoothstep(620, 780, y + 60 * grain)) * (1 - smoothstep(0.55, 0.85, slope));
        c = mix(c, pine, treeBand);
        const rockiness = Math.max(smoothstep(0.7, 1.05, slope), smoothstep(780, 950, y + 40 * grain));
        c = mix(c, mix(rock, scree, 0.5 + 0.5 * grain), rockiness);
        const snowy = smoothstep(SNOW_LINE - 120, SNOW_LINE + 120, y + 150 * grain) * (1 - smoothstep(SNOW_MAX_SLOPE - 0.3, SNOW_MAX_SLOPE + 0.3, slope));
        c = mix(c, snow, snowy);
        const k = (j * w + i) * 4;
        const tone = 1 + 0.05 * grain;
        px[k] = Math.max(0, Math.min(255, c[0] * tone));
        px[k + 1] = Math.max(0, Math.min(255, c[1] * tone));
        px[k + 2] = Math.max(0, Math.min(255, c[2] * tone));
        px[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* The terrain mesh from the heightfield, a plane on its side with every
 * vertex lifted, normals computed so the cel shading reads the relief. */
export function terrainMesh(field, tex) {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, field.height(pos.getX(k), pos.getZ(k)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, celMaterial({ color: 0xffffff, rim: 0.12, map: tex, key: 'alps-ground' }));
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
export function farRange() {
  const size = 24000;
  const n = 96;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colour = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x7d7b77);
  const snow = new THREE.Color(0xf4f6fa);
  const green = new THREE.Color(0x4f7a3a);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const r = Math.hypot(x, z);
    /* Nothing inside the field, a rising skirt across the field's edge,
     * peaks to two and a half kilometres beyond it. */
    const skirt = smoothstep(HALF - 600, HALF + 1800, r);
    const h = skirt * (1500 + 900 * fbm(x / 2200, z / 2200, 4) + 350 * fbm(x / 700, z / 700, 3)) - 40 * (1 - skirt);
    pos.setY(k, h);
    const t = smoothstep(1300, 1900, h + 200 * fbm(x / 900, z / 900, 2));
    c.copy(green).lerp(rock, smoothstep(700, 1300, h)).lerp(snow, t);
    colour[k * 3] = c.r;
    colour[k * 3 + 1] = c.g;
    colour[k * 3 + 2] = c.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.computeVertexNormals();
  const mat = celMaterial({ color: 0xffffff, rim: 0.1 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'far-range';
  return mesh;
}

