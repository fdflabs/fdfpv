/*
 * hangarroomview.js: the walkable hangar drawn (docs/HANGAR-ROOM.md). The
 * floor plan and the walk are src/game/hangarroom.js's; this builds what
 * they describe and draws it into the shell's own canvas.
 *
 * CHEAP BY CONSTRUCTION. Every wall, beam and piece of furniture is
 * merged at build into one mesh per material: a lit one, flat shaded with
 * vertex colours and no texture, and an unlit one for what gives light
 * (screens, lamps, the daylight through the door). So the room is three
 * draws however much furniture stands in it, and a layout change is a
 * rebuild, which is rare. The pilot is the Interior's people
 * (src/render/library/people/figures.js), one instance, one draw. The aircraft
 * on its stand is the flown model, one draw a part.
 *
 * NO SECOND CONTEXT, as carousel3d.js: the shell's renderer draws the room
 * into a target with a depth buffer (the canvas has none) and the target
 * is copied to the canvas, converted to sRGB by hand since the map's post
 * chain owns the renderer's output space. The renderer's state is put
 * back as it was found.
 *
 * `naive` builds one mesh per piece with its own material, the way a room
 * is usually first written: scripts/hangar-room-perf.js draws both to
 * show what the merge saves. Nothing else asks for it.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CELL, ROOMS, LAYOUTS, frontHeading, placement,
} from '../game/hangarroom.js';
import { makeFigures } from './library/people/figures.js';
import { drawDecal } from './decalart.js';
import { newDecal } from '../../configs/paint.js';
import { str } from '../strings/index.js';

/* Linear colours. The worlds outside are pale sky over olive ground
 * (assets/gate/hangar.jpg); inside, bare concrete, pale corrugated steel,
 * dark steel, plywood, and the red the stock planes wear. */
const C = {
  floor: [0.32, 0.31, 0.29],
  floorB: [0.29, 0.285, 0.27],
  wall: [0.42, 0.47, 0.5],
  wallB: [0.36, 0.41, 0.44],
  skirt: [0.08, 0.085, 0.09],
  steel: [0.06, 0.065, 0.07],
  ceiling: [0.12, 0.13, 0.14],
  wood: [0.36, 0.22, 0.11],
  ply: [0.55, 0.42, 0.26],
  red: [0.55, 0.06, 0.04],
  olive: [0.2, 0.2, 0.08],
  blue: [0.06, 0.12, 0.25],
  black: [0.02, 0.02, 0.022],
  gold: [0.62, 0.42, 0.1],
  silver: [0.5, 0.52, 0.55],
  plinth: [0.1, 0.11, 0.12],
  door: [0.3, 0.33, 0.33],
};
/* The field hangar's: dirt underfoot, olive canvas, sandbags, timber
 * poles. Plain cloth and earth, no markings of any army. */
const FIELD = {
  floor: [0.2, 0.15, 0.09],
  floorB: [0.18, 0.135, 0.08],
  wall: [0.16, 0.17, 0.08],
  wallB: [0.13, 0.14, 0.065],
  ceiling: [0.11, 0.12, 0.055],
  sandbag: [0.42, 0.36, 0.24],
  sandbagB: [0.36, 0.31, 0.2],
};
/* Unlit colours, linear: what is seen through the door, a lamp, a screen. */
const L = {
  skyTop: [0.5, 0.62, 0.78],
  skyLow: [0.72, 0.78, 0.84],
  ground: [0.2, 0.2, 0.08],
  lamp: [1.6, 1.55, 1.4],
  screen: [0.08, 0.16, 0.22],
  ring: [0.25, 1.0, 0.55],
};

/* The roller door's opening, m: wide enough to carry the Bramor out. */
const DOOR_W = { garage: 2.6, workshop: 3.6, airfield: 14, field: 6 };
const DOOR_H = { garage: 2.2, workshop: 3.2, airfield: 5.6, field: 3 };
/* The stand's deck height, m. */
export const STAND_TOP = 0.55;

/* The trophy wall's slots, in the board's own frame: three shelves of six. */
const TROPHY_ROWS = 3;
const TROPHY_COLS = 6;
const TROPHY_SLOTS = [];
for (let k = 0; k < TROPHY_ROWS; k += 1) {
  for (let t = 0; t < TROPHY_COLS; t += 1) {
    TROPHY_SLOTS.push([-0.75 + t * 0.3, 1.08 + k * 0.38, -0.1]);
  }
}
/* A first's trophy colour, linear, by its kind (src/game/progress.js
 * firstsOf keys): a mission won gold, a star silver, an aircraft's
 * milestone bronze, a lesson passed steel blue, a room game finished on a
 * world green. */
const TROPHY_COLOUR = {
  win: [0.62, 0.42, 0.1],
  star: [0.5, 0.52, 0.55],
  aircraft: [0.4, 0.2, 0.08],
  lesson: [0.12, 0.22, 0.4],
  game: [0.1, 0.36, 0.16],
  /* Flight Club medals (src/game/medals.js), brighter than the firsts'
   * metals so a medal reads as one beside a mission's cup. */
  gold: [0.85, 0.6, 0.12],
  silver: [0.72, 0.74, 0.78],
  bronze: [0.55, 0.28, 0.1],
};
/* A trophy's kind from its key: a first's (progress.js firstsOf), or
 * `medal:<course>:<step>` for a Flight Club medal. */
export function trophyKind(key) {
  if (key.startsWith('medal:')) {
    return key.slice(key.lastIndexOf(':') + 1);
  }
  if (key.startsWith('mission:')) {
    return key.endsWith(':win') ? 'win' : 'star';
  }
  if (key.startsWith('game:')) {
    return 'game';
  }
  return key.startsWith('aircraft:') ? 'aircraft' : 'lesson';
}

/* Photo mode: the camera's distance from the stand at zoom 1, m. */
const PHOTO_DIST = 2.6;
/* The photo wall: frames of 16 by 9, three by two, from one atlas. */
export const PHOTO_FRAMES = 6;
const FRAME_W = 0.64;
const FRAME_H = 0.36;
/* THE WALL ATLAS: one texture for everything hung on the walls, so the
 * room's texture count does not grow with them (the budget, hangar:perf,
 * has none to spare at Low or Medium). Three bands CELL_H high: the two
 * rows of photos, then the paint chart's chips, CHIPS of them. */
const ATLAS_W = 1536;
const CELL_H = 288;
const ATLAS_H = CELL_H * 3;
/* The paint chart: a chip a shop finish or decal the wallet owns, two
 * rows of four on the wall behind the shop, m. */
const CHIPS = 8;
const CHIP_PX = ATLAS_W / CHIPS;
const CHIP_W = 0.22;
const CHIP_H = (CHIP_W * CELL_H) / CHIP_PX;
const CHIP_GAP = 0.03;
const CHART_TOP = 2.2;
/* A finish chip drawn as a paint maker's card shows it: the paint in a
 * gradient from its lit edge to its shade, the finish's own highlight
 * over it. sRGB, as a 2D canvas takes them. */
const CHIP_PAINT = {
  satin: { from: '#3d6fa8', to: '#1d3555', sheen: 0.18, wide: true },
  pearl: { from: '#f4f1ea', to: '#b9c3cc', sheen: 0.55, edge: '#e8dcf2' },
  candy: { from: '#c4162a', to: '#3a0208', sheen: 0.7 },
  gold: { from: '#f2cf6b', to: '#7a5212', sheen: 0.8 },
  flake: { from: '#2d4f8f', to: '#0b1530', sheen: 0.45, flake: true },
  brushed: { from: '#b9bec4', to: '#5d636a', sheen: 0.3, brush: true },
};

/* The follow camera: behind the pilot and above, looking at the chest. */
const CAM_BACK = 3.0;
const CAM_UP = 1.7;
const LOOK_UP = 1.15;
const CAM_FOV = 60;
/* How far out of the open door the camera may stand, m. */
const OUTSIDE = 1.8;
/* The follow spring, radians a second. */
const CAM_OMEGA = 6;

/*
 * A piece list: boxes and cylinders, each with a colour, put in a frame.
 * Built non indexed with a colour per vertex, so the whole room merges
 * into one geometry.
 */
function pieces() {
  const list = [];
  const m = new THREE.Matrix4();
  const add = (g, colour, x, y, z, ry = 0) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    m.makeRotationY(ry).setPosition(x, y, z);
    ng.applyMatrix4(m);
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col.set(colour, i * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(ng);
    return ng;
  };
  return {
    list,
    /* A box by its size and the centre of its base. */
    box: (w, h, d, colour, x, y, z, ry) => add(new THREE.BoxGeometry(w, h, d), colour, x, y + h / 2, z, ry),
    cyl: (r, h, colour, x, y, z, seg = 8) => add(new THREE.CylinderGeometry(r, r, h, seg), colour, x, y + h / 2, z),
    /* A flat quad facing +z, by its centre. */
    quad: (w, h, colour, x, y, z, ry = 0) => add(new THREE.PlaneGeometry(w, h), colour, x, y, z, ry),
    raw: (g, colour) => add(g, colour, 0, 0, 0),
  };
}

/*
 * The furniture, each in its own frame: the footprint's centre on the
 * floor, its front to +z, sizes w by d in metres. `lit` takes the solid
 * parts, `glow` what gives light.
 */
const FURNITURE = {
  stand(lit, glow) {
    lit.cyl(0.95, STAND_TOP - 0.02, C.plinth, 0, 0, 0, 12);
    lit.cyl(0.9, 0.02, C.steel, 0, STAND_TOP - 0.02, 0, 12);
    const ring = new THREE.RingGeometry(0.86, 0.9, 32).rotateX(-Math.PI / 2).translate(0, STAND_TOP + 0.002, 0);
    glow.raw(ring, L.ring);
  },
  /* A bay: the stand's plinth without its ring, which marks the one
   * stand that changes aircraft. */
  bay(lit) {
    lit.cyl(0.95, STAND_TOP - 0.02, C.plinth, 0, 0, 0, 12);
    lit.cyl(0.9, 0.02, C.steel, 0, STAND_TOP - 0.02, 0, 12);
  },
  bench(lit) {
    lit.box(1.95, 0.05, 0.8, C.ply, 0, 0.86, 0.05);
    for (const x of [-0.9, 0.9]) {
      for (const z of [-0.28, 0.38]) {
        lit.box(0.06, 0.86, 0.06, C.steel, x, 0, z);
      }
    }
    lit.box(1.85, 0.03, 0.6, C.wood, 0, 0.18, 0.05);
    /* A pegboard on the wall behind, tools on it, a vise on the top. */
    lit.box(1.9, 0.9, 0.03, C.ply, 0, 1.0, -0.46);
    for (const [x, y, w, h, c] of [[-0.7, 1.3, 0.05, 0.35, C.red], [-0.55, 1.35, 0.04, 0.3, C.black], [-0.4, 1.32, 0.05, 0.25, C.blue],
      [0.1, 1.15, 0.5, 0.04, C.steel], [0.1, 1.5, 0.4, 0.04, C.steel], [0.6, 1.25, 0.18, 0.35, C.red]]) {
      lit.box(w, h, 0.04, c, x, y, -0.43);
    }
    lit.box(0.18, 0.12, 0.2, C.blue, 0.75, 0.91, 0.2);
    lit.box(0.3, 0.08, 0.22, C.olive, -0.4, 0.91, 0.15);
  },
  shelf(lit) {
    for (const x of [-0.72, 0.72]) {
      lit.box(0.04, 2.0, 0.42, C.steel, x, 0, -0.02);
    }
    const bins = [C.red, C.olive, C.blue, C.ply];
    for (let k = 0; k < 4; k += 1) {
      const y = 0.12 + k * 0.5;
      lit.box(1.44, 0.03, 0.42, C.steel, 0, y, -0.02);
      for (let b = 0; b < 3; b += 1) {
        lit.box(0.36, 0.2, 0.32, bins[(k + b) % 4], -0.45 + b * 0.45, y + 0.03, 0);
      }
    }
  },
  shop(lit, glow) {
    lit.box(0.95, 0.04, 0.48, C.ply, 0, 0.74, 0);
    for (const x of [-0.43, 0.43]) {
      lit.box(0.04, 0.74, 0.44, C.steel, x, 0, 0);
    }
    lit.box(0.36, 0.02, 0.24, C.black, 0, 0.78, 0.06);
    lit.box(0.36, 0.24, 0.015, C.black, 0, 0.79, -0.07, 0);
    glow.quad(0.32, 0.2, L.screen, 0, 0.91, -0.06);
  },
  /* The board and its shelves; the trophies on them are the pilot's
   * (setTrophies), in TROPHY_SLOTS. */
  trophies(lit) {
    lit.box(1.9, 1.3, 0.04, C.wood, 0, 0.9, -0.21);
    for (let k = 0; k < TROPHY_ROWS; k += 1) {
      lit.box(1.8, 0.03, 0.2, C.wood, 0, 1.05 + k * 0.38, -0.1);
    }
  },
  tv(lit, glow) {
    lit.box(1.45, 0.48, 0.42, C.wood, 0, 0, 0);
    lit.box(1.25, 0.74, 0.05, C.black, 0, 0.62, -0.08);
    glow.quad(1.17, 0.66, L.screen, 0, 0.99, -0.05);
  },
  chest(lit) {
    lit.box(0.86, 1.0, 0.44, C.red, 0, 0.06, 0);
    for (let k = 0; k < 5; k += 1) {
      lit.box(0.8, 0.012, 0.01, C.black, 0, 0.2 + k * 0.17, 0.225);
    }
    for (const x of [-0.36, 0.36]) {
      lit.cyl(0.03, 0.06, C.black, x, 0, 0.16);
    }
  },
  couch(lit) {
    lit.box(1.9, 0.42, 0.85, C.olive, 0, 0, 0.02);
    lit.box(1.9, 0.5, 0.2, C.olive, 0, 0.42, -0.31);
    for (const x of [-0.88, 0.88]) {
      lit.box(0.16, 0.22, 0.85, C.olive, x, 0.42, 0.02);
    }
  },
  crates(lit) {
    lit.box(0.95, 0.6, 0.95, C.ply, 0, 0, 0);
    lit.box(0.7, 0.45, 0.6, C.wood, 0.05, 0.6, 0.05, 0.3);
  },
};

/* The room's shell: floor, walls with the door in the +z one, a ceiling
 * or roof beams, lamps, and what the door looks out on. */
function buildShell(tier, lit, glow) {
  const room = ROOMS[tier];
  const W = room.w * CELL;
  const D = room.d * CELL;
  const H = room.h;
  const field = room.look === 'field';
  const P = field ? { ...C, ...FIELD } : C;
  /* Floor slabs a metre square, alternately a shade apart. */
  for (let x = 0; x < W; x += 1) {
    for (let z = 0; z < D; z += 1) {
      const w = Math.min(1, W - x);
      const d = Math.min(1, D - z);
      lit.box(w, 0.02, d, (Math.floor(x) + Math.floor(z)) % 2 ? P.floor : P.floorB, x + w / 2 - W / 2, -0.02, z + d / 2 - D / 2);
    }
  }
  /* Walls: corrugated, strips a quarter metre wide in two shades. */
  const strips = (len, ry, place) => {
    for (let s = 0; s < len; s += 0.5) {
      const w = Math.min(0.5, len - s);
      place(s, w, ry);
    }
  };
  strips(W, 0, (s, w) => {
    lit.box(w / 2, H, 0.04, P.wall, s + w / 4 - W / 2, 0, -D / 2 - 0.02);
    lit.box(w / 2, H, 0.04, P.wallB, s + (3 * w) / 4 - W / 2, 0, -D / 2 - 0.01);
  });
  for (const side of [-1, 1]) {
    strips(D, 0, (s, w) => {
      lit.box(0.04, H, w / 2, P.wall, side * (W / 2 + 0.02), 0, s + w / 4 - D / 2);
      lit.box(0.04, H, w / 2, P.wallB, side * (W / 2 + 0.01), 0, s + (3 * w) / 4 - D / 2);
    });
  }
  const dw = DOOR_W[tier];
  const dh = DOOR_H[tier];
  const side = (W - dw) / 2;
  lit.box(side, H, 0.06, P.wall, -W / 2 + side / 2, 0, D / 2);
  lit.box(side, H, 0.06, P.wall, W / 2 - side / 2, 0, D / 2);
  lit.box(dw, H - dh, 0.06, P.wall, 0, dh, D / 2);
  /* The door rolled up into its drum, and its frame. */
  lit.box(dw + 0.2, 0.3, 0.3, C.door, 0, dh, D / 2 - 0.1);
  for (const sx of [-1, 1]) {
    lit.box(0.1, dh, 0.12, C.steel, sx * (dw / 2 + 0.05), 0, D / 2);
  }
  /* A dark skirting all round. */
  lit.box(W, 0.12, 0.02, C.skirt, 0, 0, -D / 2 + 0.01);
  for (const sx of [-1, 1]) {
    lit.box(0.02, 0.12, D, C.skirt, sx * (W / 2 - 0.01), 0, 0);
  }
  /* The ceiling, and in the bigger rooms steel beams under it every few
   * metres. */
  lit.box(W, 0.04, D, P.ceiling, 0, H, 0);
  if (field) {
    /* Timber poles along the walls and a ridge beam, and a low wall of
     * sandbags against each side, thin enough that the walk needs no cells for them. */
    for (let z = -D / 2 + 1; z < D / 2 - 0.5; z += 2.5) {
      for (const sx of [-1, 1]) {
        lit.box(0.14, H, 0.14, C.wood, sx * (W / 2 - 0.1), 0, z);
      }
    }
    lit.box(0.16, 0.2, D, C.wood, 0, H - 0.2, 0);
    for (const sx of [-1, 1]) {
      for (let row = 0; row < 3; row += 1) {
        for (let z = -D / 2 + 0.4 + (row % 2) * 0.3; z < D / 2 - 0.6; z += 0.6) {
          lit.box(0.2, 0.17, 0.55, (row + Math.round(z * 2)) % 2 ? P.sandbag : P.sandbagB, sx * (W / 2 - 0.12), row * 0.17, z);
        }
      }
    }
  } else if (tier !== 'garage') {
    const step = tier === 'airfield' ? 4 : 2.5;
    for (let z = -D / 2 + step; z < D / 2 - 0.1; z += step) {
      lit.box(W, 0.25, 0.12, C.steel, 0, H - 0.25, z);
    }
  }
  /* Lamps: strips under the ceiling over the floor's long axis. */
  const lampRows = tier === 'airfield' ? 4 : 2;
  for (let r = 0; r < lampRows; r += 1) {
    const x = -W / 2 + ((r + 0.5) * W) / lampRows;
    glow.raw(new THREE.PlaneGeometry(0.18, D * 0.7).rotateX(Math.PI / 2).translate(x, H - 0.3, 0), L.lamp);
  }
  /* Outside the door: olive ground to a pale horizon. Unlit, so the open
   * door is the brightest thing in the room. */
  const far = D / 2 + 6;
  const sky = new THREE.PlaneGeometry(dw * 4, dh * 3, 1, 2).rotateY(Math.PI).translate(0, dh * 1.5, far);
  const g = glow.raw(sky, L.skyTop);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(1, pos.getY(i) / (dh * 3));
    g.attributes.color.setXYZ(i, ...L.skyLow.map((v, k) => v + (L.skyTop[k] - v) * t));
  }
  glow.raw(new THREE.PlaneGeometry(dw * 4, 6).rotateX(-Math.PI / 2).translate(0, -0.01, D / 2 + 3), L.ground);
}

function build(tier, layout, { naive = false } = {}) {
  const lit = pieces();
  const glow = pieces();
  buildShell(tier, lit, glow);
  const shellCount = { lit: lit.list.length, glow: glow.list.length };
  const room = ROOMS[tier];
  const perPiece = [];
  for (const item of layout) {
    const before = { lit: lit.list.length, glow: glow.list.length };
    const p = placement(room, item);
    const ry = Math.PI - frontHeading(item);
    const pl = pieces();
    const pg = pieces();
    FURNITURE[item.kind](pl, pg);
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(p.x, 0, p.z);
    for (const g of pl.list) {
      lit.list.push(g.applyMatrix4(m));
    }
    for (const g of pg.list) {
      glow.list.push(g.applyMatrix4(m));
    }
    perPiece.push({ lit: lit.list.slice(before.lit), glow: glow.list.slice(before.glow) });
  }
  const group = new THREE.Group();
  group.name = 'hangar-room';
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const materials = [litMat, glowMat];
  const add = (geos, mat, casts) => {
    if (!geos.length) {
      return;
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = mat.isMeshStandardMaterial;
    mesh.castShadow = casts;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  /* The walls and ceiling take shadows and cast none: the light is the
   * lamps', from under the ceiling, which a ceiling that cast would put
   * the whole room in the shade of. */
  if (!naive) {
    add(lit.list.slice(0, shellCount.lit), litMat, false);
    add(lit.list.slice(shellCount.lit), litMat, true);
    add(glow.list, glowMat, false);
  } else {
    add(lit.list.slice(0, shellCount.lit), litMat, false);
    add(glow.list.slice(0, shellCount.glow), glowMat, false);
    for (const part of perPiece) {
      for (const g of part.lit) {
        const mat = litMat.clone();
        materials.push(mat);
        add([g], mat, true);
      }
      for (const g of part.glow) {
        add([g], glowMat, false);
      }
    }
  }
  return {
    group,
    dispose() {
      group.traverse((o) => o.geometry && o.geometry.dispose());
      materials.forEach((mat) => mat.dispose());
    },
  };
}

const BLIT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const BLIT_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  gl_FragColor = vec4(toSrgb(clamp(texture2D(map, vUv).rgb, 0.0, 1.0)), 1.0);
}`;

/*
 * One chip of the paint chart into the atlas's chart band at slot `i`:
 * `item` { kind: 'finish' | 'decal', paint }. A finish is a swatch in its
 * look (CHIP_PAINT), a decal its own drawing (decalart.js) on a pale card;
 * under each its name in the pilot's language, the shop's own words.
 */
function paintChip(g, i, item) {
  const x0 = i * CHIP_PX;
  const y0 = CELL_H * 2;
  const pad = 10;
  const sw = CHIP_PX - pad * 2;
  const sh = CELL_H - 74;
  g.fillStyle = '#e9e6df';
  g.fillRect(x0 + 2, y0 + 2, CHIP_PX - 4, CELL_H - 4);
  g.save();
  g.translate(x0 + pad, y0 + pad);
  if (item.kind === 'finish') {
    const c = CHIP_PAINT[item.paint] || CHIP_PAINT.satin;
    const grad = g.createLinearGradient(0, 0, sw, sh);
    grad.addColorStop(0, c.edge || c.from);
    grad.addColorStop(0.35, c.from);
    grad.addColorStop(1, c.to);
    g.fillStyle = grad;
    g.fillRect(0, 0, sw, sh);
    if (c.brush) {
      for (let y = 0; y < sh; y += 3) {
        g.fillStyle = `rgba(255,255,255,${0.04 + ((y * 7919) % 13) / 130})`;
        g.fillRect(0, y, sw, 1);
      }
    }
    if (c.flake) {
      for (let k = 0; k < 420; k += 1) {
        const fx = (k * 7919) % sw;
        const fy = (k * 104729) % sh;
        g.fillStyle = `rgba(255,255,255,${0.15 + (k % 7) / 10})`;
        g.fillRect(fx, fy, 2, 2);
      }
    }
    const hi = g.createRadialGradient(sw * 0.3, sh * 0.25, 2, sw * 0.3, sh * 0.25, c.wide ? sw : sw * 0.45);
    hi.addColorStop(0, `rgba(255,255,255,${c.sheen})`);
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, sw, sh);
  } else {
    g.fillStyle = '#5b6168';
    g.fillRect(0, 0, sw, sh);
    const d = newDecal(item.paint, [0, 0, 0], [0, 0, 1]);
    const k = Math.min((sw * 0.86) / d.a, sh * 0.86);
    g.setTransform(k, 0, 0, k, x0 + pad + (sw - k * d.a) / 2, y0 + pad + (sh - k) / 2);
    drawDecal(g, d, d.a);
  }
  g.restore();
  g.fillStyle = '#16191c';
  g.font = '600 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(str(`hangar.${item.kind}_${item.paint}`), x0 + CHIP_PX / 2, y0 + CELL_H - 38, CHIP_PX - 16);
}

/*
 * A craft baked for a bay: every part it shows as one geometry in the
 * parked frame (nose to +z, lowest point on y 0), each part's paint as
 * its vertices' colour, so every bay in the room is one draw however
 * many parts their aircraft have. What a colour cannot carry (a finish's
 * shine, the decals) is the main stand's to show: a bay is seen from
 * across the room. The craft is only read.
 */
function bakeCraft(craft) {
  if (craft.launcher) {
    craft.launcher.visible = false;
  }
  if (craft.setChute) {
    craft.setChute(0);
  }
  for (const d of craft.discs || []) {
    d.visible = false;
  }
  const g = craft.group;
  g.updateMatrixWorld(true);
  const toCraft = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const geos = [];
  const one = new THREE.Matrix4();
  const grey = new THREE.Color(0.3, 0.3, 0.3);
  const colourOf = (mat) => (mat && mat.color ? mat.color : grey);
  g.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) {
      return;
    }
    for (let p = o; p && p !== g.parent; p = p.parent) {
      if (!p.visible) {
        return;
      }
    }
    const m = new THREE.Matrix4().multiplyMatrices(toCraft, o.matrixWorld);
    const base = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(base.attributes)) {
      if (n !== 'position' && n !== 'normal') {
        base.deleteAttribute(n);
      }
    }
    base.morphAttributes = {};
    if (!base.attributes.normal) {
      base.computeVertexNormals();
    }
    const count = base.attributes.position.count;
    const col = new Float32Array(count * 3);
    const mats = [].concat(o.material);
    const groups = Array.isArray(o.material) && base.groups.length ? base.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const gr of groups) {
      const c = colourOf(mats[gr.materialIndex]);
      for (let v = gr.start; v < Math.min(count, gr.start + gr.count); v += 1) {
        col[v * 3] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
      }
    }
    base.setAttribute('color', new THREE.BufferAttribute(col, 3));
    base.clearGroups();
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k += 1) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(k, one);
      } else {
        one.identity();
      }
      geos.push((k < n - 1 ? base.clone() : base).applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, one)));
    }
  });
  if (!geos.length) {
    return null;
  }
  const merged = mergeGeometries(geos);
  geos.forEach((x) => x.dispose());
  merged.rotateY(Math.PI);
  merged.computeBoundingBox();
  merged.translate(0, -merged.boundingBox.min.y, 0);
  return merged;
}

/*
 * The room's view: { scene, camera, setRoom(tier, layout), setCraft(obj),
 * update(dt, pose, ms, orbit), draw(), stats(), dispose() }. graphics is
 * the quality preset (src/render/quality.js): multisampling off and no
 * shadow map on Low.
 */
export function createRoomView(renderer, { graphics, naive = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.05, 120);
  scene.add(new THREE.HemisphereLight(0xd8e2ea, 0x3a3a26, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  scene.add(sun, sun.target);
  const shadows = graphics.shadows;
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(graphics.field.shadowMap, graphics.field.shadowMap);
    sun.shadow.bias = -0.0005;
  }
  const pilot = makeFigures(THREE, { cap: 1 });
  scene.add(pilot.group);
  /* The pilot's trophies, one instanced cup per first: one draw. */
  const cupGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8).translate(0, 0.02, 0),
    new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6).translate(0, 0.07, 0),
    new THREE.CylinderGeometry(0.06, 0.03, 0.09, 8).translate(0, 0.145, 0),
  ]);
  const cups = new THREE.InstancedMesh(cupGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6, flatShading: true }), TROPHY_SLOTS.length);
  cups.count = 0;
  cups.castShadow = true;
  scene.add(cups);
  let wallMatrix = null;
  let captureWanted = null;
  let photoWall = null;
  let photoCount = 0;
  let photoList = [];
  let chartItems = [];
  let chartKey = '';
  let chartShown = 0;
  let trophyKey = '';
  /* Each cup's kind, in wall order, for a check to read. */
  let trophyKinds = [];
  /* The bays' aircraft, one baked mesh (bakeCraft), smooth shaded as the
   * flown models are, where the room's own pieces are flat. */
  const bayMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  let bays = null;
  let bayAirframes = [];
  let layoutNow = [];
  const craftSlot = new THREE.Group();
  scene.add(craftSlot);

  let built = null;
  let tier = null;
  const samples = graphics.id === 'low' ? 0 : 4;
  const target = new THREE.WebGLRenderTarget(2, 2, { samples, depthBuffer: true, type: THREE.HalfFloatType });
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: target.texture } }, vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
  });
  const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
  blit.frustumCulled = false;
  const blitScene = new THREE.Scene();
  blitScene.add(blit);
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const cam = { x: 0, y: CAM_UP, z: 0, vx: 0, vy: 0, vz: 0, placed: false };
  const look = new THREE.Vector3();
  const info = { calls: 0, triangles: 0 };

  function setRoom(nextTier, layout = LAYOUTS[nextTier]) {
    if (built) {
      built.dispose();
      scene.remove(built.group);
    }
    tier = nextTier;
    layoutNow = layout;
    setBays([]);
    built = build(tier, layout, { naive });
    scene.add(built.group);
    const room = ROOMS[tier];
    const W = room.w * CELL;
    const D = room.d * CELL;
    /* The lamps' light, from under the ceiling and a little toward the
     * door, so a shadow falls just behind what casts it. */
    sun.position.set(-W * 0.08, room.h - 0.2, D * 0.12);
    sun.target.position.set(0, 0, -D * 0.05);
    if (shadows) {
      const half = Math.max(W, D) * 0.6;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.05, far: room.h * 2 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    const wall = layout.find((it) => it.kind === 'trophies');
    wallMatrix = null;
    if (wall) {
      const p = placement(room, wall);
      wallMatrix = new THREE.Matrix4().makeRotationY(Math.PI - frontHeading(wall)).setPosition(p.x, 0, p.z);
    }
    trophyKey = null;
    cups.count = 0;
    const stand = layout.find((it) => it.kind === 'stand');
    if (stand) {
      const p = placement(room, stand);
      craftSlot.position.set(p.x, STAND_TOP, p.z);
    }
    cam.placed = false;
  }

  /*
   * The aircraft on the stand, nose to the door, its lowest point on the
   * deck: a craft builder's object (src/render/craft.js), parked as the
   * picker parks it (no launcher, chute or prop blur). It stands still,
   * so what is drawn is a copy merged into one mesh per material: the
   * Bramor's 51 shown parts are 51 draws and 51 more for its shadow
   * otherwise, more than the whole room. The caller keeps the original;
   * a repaint is a new setCraft.
   */
  let parked = null;
  /* A craft parked: a merged copy per material, standing on y 0, nose
   * to +z. The caller keeps the original. */
  function parkCraft(craft) {
    if (craft.launcher) {
      craft.launcher.visible = false;
    }
    if (craft.setChute) {
      craft.setChute(0);
    }
    for (const d of craft.discs || []) {
      d.visible = false;
    }
    const g = craft.group;
    g.updateMatrixWorld(true);
    const toCraft = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map();
    const loose = [];
    g.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      for (let p = o; p && p !== g.parent; p = p.parent) {
        if (!p.visible) {
          return;
        }
      }
      const m = new THREE.Matrix4().multiplyMatrices(toCraft, o.matrixWorld);
      if (o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) {
        loose.push(o);
        return;
      }
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m);
      if (!buckets.has(o.material)) {
        buckets.set(o.material, []);
      }
      buckets.get(o.material).push(geo);
    });
    const parked = new THREE.Group();
    for (const [mat, geos] of buckets) {
      /* Only the attributes every part has, so the parts merge. */
      const names = Object.keys(geos[0].attributes).filter((n) => geos.every((x) => x.attributes[n]));
      for (const x of geos) {
        Object.keys(x.attributes).filter((n) => !names.includes(n)).forEach((n) => x.deleteAttribute(n));
        x.morphAttributes = {};
      }
      const merged = mergeGeometries(geos);
      const parts = merged ? [merged] : geos;
      if (merged) {
        geos.forEach((x) => x.dispose());
      }
      for (const geo of parts) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        parked.add(mesh);
      }
    }
    for (const o of loose) {
      const c = o.clone();
      c.userData.borrowed = true;
      new THREE.Matrix4().multiplyMatrices(toCraft, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      parked.add(c);
    }
    const box = new THREE.Box3().setFromObject(parked, true);
    parked.rotation.set(0, Math.PI, 0);
    parked.position.y = Number.isFinite(box.min.y) ? -box.min.y : 0;
    return parked;
  }

  function disposeParked(group) {
    /* A loose part's geometry is the caller's craft's. */
    group.traverse((o) => o.geometry && !o.userData.borrowed && o.geometry.dispose());
  }

  function setCraft(craft) {
    if (parked) {
      disposeParked(parked);
      parked = null;
    }
    craftSlot.clear();
    if (!craft) {
      return;
    }
    parked = parkCraft(craft);
    craftSlot.add(parked);
  }

  /*
   * THE ROOM'S LINEUP (docs/SHOW-IT-OFF.md part 3): every pilot's aircraft
   * parked side by side on the floor between the stand and the door, in
   * the order given, and the camera square on to the row. Empty, the
   * row goes and the stand is the room's again.
   */
  let lineup = null;
  function setLineup(crafts) {
    if (lineup) {
      lineup.children.forEach(disposeParked);
      scene.remove(lineup);
      lineup = null;
    }
    lineupShot = null;
    if (!crafts.length) {
      return;
    }
    lineup = new THREE.Group();
    const parts = crafts.map(parkCraft);
    const widths = parts.map((g) => new THREE.Box3().setFromObject(g, true).getSize(new THREE.Vector3()).x);
    const gap = 0.6;
    const total = widths.reduce((a, w) => a + w, 0) + gap * (parts.length - 1);
    let x = -total / 2;
    const z = craftSlot.position.z + 3;
    parts.forEach((g, i) => {
      g.position.x = x + widths[i] / 2;
      g.position.z = z;
      x += widths[i] + gap;
      lineup.add(g);
    });
    scene.add(lineup);
    lineupShot = { z, width: total };
  }
  let lineupShot = null;

  /* The camera square on to the lineup's row, far enough to hold it all. */
  function aimAtLineup() {
    const room = ROOMS[tier];
    const D = (room.d * CELL) / 2 - 0.15;
    const half = Math.max(1.5, lineupShot.width / 2 + 0.5);
    const dist = half / (Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2)) * camera.aspect) + 0.5;
    camera.position.set(0, 1.6, Math.min(D, lineupShot.z + dist));
    look.set(0, 0.4, lineupShot.z);
    camera.lookAt(look);
    cam.placed = false;
  }

  /* The camera's spring toward where it wants to be: behind the pilot,
   * turned by `orbit` radians, kept inside the walls and under the
   * ceiling. */
  function follow(dt, pose, orbit) {
    const room = ROOMS[tier];
    const W = (room.w * CELL) / 2 - 0.15;
    const D = (room.d * CELL) / 2 - 0.15;
    const h = pose.heading + orbit;
    let bx = -Math.sin(h) * CAM_BACK;
    let bz = Math.cos(h) * CAM_BACK;
    /* Pulled in along the line to the pilot when a wall is in the way. */
    let s = 1;
    if (Math.abs(pose.x + bx) > W) {
      s = Math.min(s, (W * Math.sign(bx) - pose.x) / bx);
    }
    /* The door is open: a camera behind a pilot standing in it looks in
     * from outside, rather than being pulled in to their shoulder (in the
     * garage corner it was 1 m behind them). Only where the line to the
     * camera passes through the opening, under its top. */
    const xDoor = bz > 0 ? pose.x + bx * ((D - pose.z) / bz) : Infinity;
    const front = Math.abs(xDoor) < DOOR_W[tier] / 2 - 0.25 && CAM_UP < DOOR_H[tier] - 0.2 ? D + OUTSIDE : D;
    if (pose.z + bz > front || pose.z + bz < -D) {
      s = Math.min(s, ((bz > 0 ? front : -D) - pose.z) / bz);
    }
    s = Math.max(0.25, s);
    bx *= s;
    bz *= s;
    const want = [pose.x + bx, Math.min(room.h - 0.25, CAM_UP + (1 - s) * 0.6), pose.z + bz];
    if (!cam.placed) {
      [cam.x, cam.y, cam.z] = want;
      cam.vx = 0;
      cam.vy = 0;
      cam.vz = 0;
      cam.placed = true;
    }
    /* Critically damped, as hangarstage.js's rig. */
    const k = CAM_OMEGA * CAM_OMEGA;
    const c = 2 * CAM_OMEGA;
    const step = Math.min(dt, 0.05);
    for (const [p, v, w] of [['x', 'vx', want[0]], ['y', 'vy', want[1]], ['z', 'vz', want[2]]]) {
      cam[v] += (k * (w - cam[p]) - c * cam[v]) * step;
      cam[p] += cam[v] * step;
    }
    camera.position.set(cam.x, cam.y, cam.z);
    look.set(pose.x, LOOK_UP, pose.z);
    camera.lookAt(look);
  }

  /* PHOTO MODE's camera: round the aircraft on its stand, yaw radians
   * from the door's side, zoom a multiple of PHOTO_DIST; set at once, no
   * spring, so a picture is where the pilot put it. */
  function aimAtStand({ yaw, zoom }) {
    const room = ROOMS[tier];
    const W = (room.w * CELL) / 2 - 0.15;
    const D = (room.d * CELL) / 2 - 0.15;
    const r = PHOTO_DIST * zoom;
    const c = craftSlot.position;
    camera.position.set(
      Math.max(-W, Math.min(W, c.x + Math.sin(yaw) * r)),
      Math.min(room.h - 0.2, c.y + 0.25 + r * 0.35),
      Math.max(-D, Math.min(D, c.z + Math.cos(yaw) * r)),
    );
    look.set(c.x, c.y + 0.15, c.z);
    camera.lookAt(look);
    cam.placed = false;
  }

  /*
   * THE PHOTO WALL: the newest pictures (ImageBitmaps, at most
   * PHOTO_FRAMES) in frames on the left wall, and THE PAINT CHART: a chip
   * for each shop finish and decal the pilot's wallet owns, on the wall
   * behind the shop. Both from one atlas texture, one draw; with neither,
   * no texture is made at all.
   */
  function paintWall() {
    if (photoWall) {
      scene.remove(photoWall);
      photoWall.geometry.dispose();
      photoWall.material.map.dispose();
      photoWall.material.dispose();
      photoWall = null;
    }
    photoCount = photoList.length;
    const shop = layoutNow.find((it) => it.kind === 'shop');
    const chips = shop ? chartItems.slice(0, CHIPS) : [];
    chartShown = tier ? chips.length : 0;
    if ((!photoList.length && !chips.length) || !tier) {
      return;
    }
    const atlas = document.createElement('canvas');
    atlas.width = ATLAS_W;
    atlas.height = ATLAS_H;
    const g = atlas.getContext('2d');
    const cw = ATLAS_W / 3;
    const quads = [];
    const room = ROOMS[tier];
    const W = (room.w * CELL) / 2;
    const D = (room.d * CELL) / 2;
    /* A quad over atlas texels [u0, u1] by band rows [r0, r1), rows of
     * CELL_H counted from the top. */
    const mapTo = (q, u0, u1, r0, r1) => {
      const uv = q.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) {
        uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), 1 - (r0 + (1 - uv.getY(k)) * (r1 - r0)) / 3);
      }
      quads.push(q);
    };
    const x = -W + 0.03;
    photoList.forEach((bm, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      g.drawImage(bm, col * cw, row * CELL_H, cw, CELL_H);
      const q = new THREE.PlaneGeometry(FRAME_W, FRAME_H).rotateY(Math.PI / 2)
        .translate(x, 1.95 - row * (FRAME_H + 0.12), (col - 1) * (FRAME_W + 0.12));
      mapTo(q, col / 3, (col + 1) / 3, row, row + 1);
    });
    if (chips.length) {
      /* Hung on the wall the shop's back is to, facing the way the shop
       * does, centred over it. */
      const p = placement(room, shop);
      const h = frontHeading(shop);
      const fx = Math.sin(h);
      const fz = -Math.cos(h);
      const side = Math.abs(fx) > 0.5;
      const wx = side ? -Math.sign(fx) * (W - 0.03) : p.x;
      const wz = side ? p.z : -Math.sign(fz) * (D - 0.03);
      const ry = Math.atan2(fx, fz);
      /* Along the wall, to the right as the chart is faced. */
      const ax = Math.cos(ry);
      const az = -Math.sin(ry);
      const cols = Math.min(4, chips.length);
      chips.forEach((item, i) => {
        paintChip(g, i, item);
        const col = i % 4;
        const row = Math.floor(i / 4);
        const along = (col - (cols - 1) / 2) * (CHIP_W + CHIP_GAP);
        const q = new THREE.PlaneGeometry(CHIP_W, CHIP_H).rotateY(ry)
          .translate(wx + ax * along, CHART_TOP - CHIP_H / 2 - row * (CHIP_H + CHIP_GAP), wz + az * along);
        mapTo(q, i / CHIPS, (i + 1) / CHIPS, 2, 3);
      });
    }
    const tex = new THREE.CanvasTexture(atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    photoWall = new THREE.Mesh(mergeGeometries(quads), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    scene.add(photoWall);
  }

  function setPhotos(bitmaps) {
    photoList = bitmaps.slice(0, PHOTO_FRAMES);
    paintWall();
  }

  /* chart { finishes, decals } (src/game/hangarmine.js paintChart). */
  function setChart(chart) {
    const key = JSON.stringify(chart || null);
    if (key === chartKey) {
      return;
    }
    chartKey = key;
    chartItems = chart ? [
      ...chart.finishes.map((paint) => ({ kind: 'finish', paint })),
      ...chart.decals.map((paint) => ({ kind: 'decal', paint })),
    ] : [];
    paintWall();
  }

  /*
   * THE BAYS: the pilot's other aircraft (src/game/hangarmine.js bayFill),
   * { airframe, craft } each, craft a builder's object, in the layout's
   * bay order.
   * All of them one baked mesh, one draw and one in the shadow pass. An
   * empty list clears them.
   */
  function setBays(list) {
    if (bays) {
      scene.remove(bays);
      bays.geometry.dispose();
      bays = null;
    }
    bayAirframes = [];
    const room = ROOMS[tier];
    const slots = room ? layoutNow.filter((it) => it.kind === 'bay') : [];
    const geos = [];
    list.slice(0, slots.length).forEach(({ airframe, craft }, i) => {
      const geo = bakeCraft(craft);
      if (!geo) {
        return;
      }
      const p = placement(room, slots[i]);
      geos.push(geo.translate(p.x, STAND_TOP, p.z));
      bayAirframes.push(airframe);
    });
    if (!geos.length) {
      return;
    }
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (geos.length > 1) {
      geos.forEach((x) => x.dispose());
    }
    bays = new THREE.Mesh(geo, bayMat);
    bays.castShadow = true;
    bays.receiveShadow = true;
    bays.matrixAutoUpdate = false;
    scene.add(bays);
  }

  /* The trophies: first keys (progress.firsts), in the order given; as
   * many as the wall has slots. */
  function setTrophies(keys) {
    const key = keys.join('|');
    if (key === trophyKey) {
      return;
    }
    trophyKey = key;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    cups.count = wallMatrix ? Math.min(keys.length, TROPHY_SLOTS.length) : 0;
    trophyKinds = keys.slice(0, cups.count).map(trophyKind);
    for (let i = 0; i < cups.count; i += 1) {
      m.makeTranslation(...TROPHY_SLOTS[i]).premultiply(wallMatrix);
      cups.setMatrixAt(i, m);
      cups.setColorAt(i, colour.setRGB(...TROPHY_COLOUR[trophyKind(keys[i])]));
    }
    cups.instanceMatrix.needsUpdate = true;
    if (cups.instanceColor) {
      cups.instanceColor.needsUpdate = true;
    }
    cups.computeBoundingSphere();
  }

  return {
    scene,
    camera,
    craftSlot,
    setRoom,
    setCraft,
    setTrophies,
    /* pose { x, z, heading, moving } from hangarroom.js's walk; ms the
     * clock for the stride. */
    /* photo: null to follow the pilot, or { yaw, zoom } for photo mode:
     * the pilot out of the picture and the camera round the stand. */
    update(dt, pose, ms, orbit = 0, photo = null) {
      pilot.set(photo || lineupShot ? [] : [{
        x: pose.x, y: 0, z: pose.z, heading: pose.heading, action: pose.moving ? 'walk' : 'stand', tint: [0.1, 0.13, 0.15], seed: 2,
      }], ms);
      if (lineupShot) {
        aimAtLineup();
      } else if (photo) {
        aimAtStand(photo);
      } else {
        follow(dt, pose, orbit);
      }
    },
    /* The next frame drawn, as a JPEG Blob, to `done` (null when the
     * browser refuses). Taken straight after the draw: the canvas keeps
     * no drawing buffer. */
    capture(done) {
      captureWanted = done;
    },
    setPhotos,
    setChart,
    setBays,
    setLineup,
    draw() {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) {
        target.setSize(size.x, size.y);
      }
      camera.aspect = size.x / Math.max(1, size.y);
      camera.updateProjectionMatrix();
      const was = {
        target: renderer.getRenderTarget(),
        autoClear: renderer.autoClear,
        shadows: renderer.shadowMap.enabled,
      };
      renderer.shadowMap.enabled = shadows;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      /* Counted by hand round the draw: three resets its counters after
       * the shadow pass, which would leave that pass out. */
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      const c0 = renderer.info.render.calls;
      const t0 = renderer.info.render.triangles;
      renderer.render(scene, camera);
      info.calls = renderer.info.render.calls - c0;
      info.triangles = renderer.info.render.triangles - t0;
      renderer.info.autoReset = autoReset;
      renderer.setRenderTarget(null);
      renderer.render(blitScene, blitCam);
      if (captureWanted) {
        const done = captureWanted;
        captureWanted = null;
        renderer.domElement.toBlob((blob) => done(blob), 'image/jpeg', 0.92);
      }
      renderer.setRenderTarget(was.target);
      renderer.autoClear = was.autoClear;
      renderer.shadowMap.enabled = was.shadows;
    },
    /* camBack: the camera's distance from the pilot along the floor, m. */
    /* bays: how many aircraft stand on them; chart: the chips hung. */
    stats: () => ({
      ...info,
      tier,
      trophies: cups.count,
      trophyKinds,
      lineup: lineup ? lineup.children.length : 0,
      photos: photoCount,
      bays: bayAirframes.length,
      bayAirframes,
      chart: chartShown,
      camBack: Math.hypot(cam.x - look.x, cam.z - look.z),
    }),
    dispose() {
      if (built) {
        built.dispose();
      }
      setCraft(null);
      setLineup([]);
      setBays([]);
      photoList = [];
      chartItems = [];
      paintWall();
      bayMat.dispose();
      cupGeo.dispose();
      cups.material.dispose();
      pilot.dispose();
      sun.shadow.dispose();
      target.dispose();
      blitMat.dispose();
      blit.geometry.dispose();
    },
  };
}
