/*
 * strikercraft.js: the Striker, the war's delta wing one way attacker, and
 * the same airframe for the garage.
 *
 * The owner's reference sheets (2026-10-01): a long cylindrical fuselage
 * with a rounded nose cap and a dark band just behind it, a cranked delta
 * set low and blended into the fuselage, a fin at each wing tip with a
 * small rudder, a pusher piston engine with exposed cylinders and a two
 * blade wooden prop at the tail, bare aluminium skin with panel lines,
 * rivets, hatches and small control horns, and a skid under the belly; and
 * a second airframe of the same shape in black composite with a small
 * turbojet at the tail in place of the engine and prop, and a whip antenna.
 * So propulsion is a part ('prop' or 'jet') and the whip is optional.
 *
 * ONE PARTS LIST, TWO DRAWINGS. strikerParts() is the airframe as pieces,
 * each with its part, its paint key and its texture coordinates.
 * src/render/attackers.js merges them into one geometry with the colours
 * in its vertices, one instanced draw a kind however many fly, and spins
 * the prop in the vertex shader (strikerSpin) so it stays one draw.
 * buildStrikerCraft() draws them as named parts with a material a paint
 * region for the garage, with the shell's builder contract and the paint
 * hook of src/render/combatpaint.js.
 *
 * THE PANELS are a small texture drawn once in code (strikerSkin): seams
 * and rivet rows on a faintly mottled sheet, repeated every SKIN_TILE
 * metres over the wings, fins and fuselage, multiplied by the paint, so a
 * repaint keeps its panel lines. Everything that is not skin samples a
 * clean texel of it.
 *
 * THE LAUNCH RAIL a pilot's Striker is shot off is buildStrikerLauncher(),
 * at the end: the garage's and the flown aircraft's, never the war's.
 *
 * Generic and unmarked, as every war model is (docs/WARFARE-PLAN.md
 * section 3). Built in the model frame (src/render/frame.js: nose -z, top
 * +y, metres) about the airframe's centre, which is the point the room's
 * pose is of. Its size is the war's: 2.5 m across, 2.8 m nose to prop.
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
import { celMaterial } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';
import { paintHook } from './combatpaint.js';

/* The airframe's stations, metres. */
const NOSE_Z = -1.40;
const CAP_Z = -1.06;
const BODY_R = 0.17;
const BODY_END_Z = 0.86;
const TAIL_Z = 1.02;
const WING_Y = -0.07;
const HALF = 1.235;
const TE_Z = 0.98;
const FIN_T = 0.016;
export const STRIKER_PROP = { r: 0.38, hub: [0, 0, 1.27] };

export const STRIKER_PROPULSION = ['prop', 'jet'];

/* The airframe as built: its paint by key, each a 0xRRGGBB. The war's
 * vertices carry these; the garage's materials start from them, one a key,
 * so the fuselage, the wing and the fins are keys of their own in the same
 * aluminium, each a paint region of its own, and the skid and the small
 * fittings are keys of their own in the engine's metals, left as built when
 * the engine is painted. */
export const STRIKER_COLOURS = {
  /* Bare aluminium, cool on purpose: the grade's warm gain in the lights
   * (src/render/post.js) turns a neutral light grey into sand. */
  skin: 0xa6b6c6,
  wing: 0xa6b6c6,
  fin: 0xa6b6c6,
  controls: 0x96a6b6,
  rudder: 0x96a6b6,
  nose: 0xb8c6d4,
  band: 0x26282a,
  metal: 0x9aa0a6,
  fitting: 0x9aa0a6,
  dark: 0x4c5054,
  skid: 0x4c5054,
  wood: 0xc79a62,
  jet: 0x8c949c,
  nozzle: 0x34373a,
  antenna: 0x1e2022,
};

/* Metres of skin one repeat of the panel texture covers, and the texel a
 * part with no panels samples: the middle of a panel, clear of seams. */
export const SKIN_TILE = 0.55;
const PLAIN_UV = 0.5;

/* ------------------------------------------------------------------ */
/* Shapes.                                                             */
/* ------------------------------------------------------------------ */

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/* A cylinder along z, r1 at the -z end. */
const cylZ = (r1, r2, len, seg) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(-Math.PI / 2);
/* A cylinder along x. */
const cylX = (r, len, seg) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);

/* A solid of revolution about z from [radius, z] pairs, front to back,
 * closed on the axis at both ends; the profile climbs so its faces point
 * out (see src/render/combatcraft.js latheZ). */
function latheZ(pairs, seg) {
  const pts = pairs.map(([r, z]) => [Math.max(r, 1e-5), z]);
  if (pts[0][0] > 1e-5) {
    pts.unshift([1e-5, pts[0][1]]);
  }
  if (pts[pts.length - 1][0] > 1e-5) {
    pts.push([1e-5, pts[pts.length - 1][1]]);
  }
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/* A flat outline in x and z, extruded `t` in y about y = 0. */
function slab(points, t) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -t / 2, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* The parts list.                                                     */
/* ------------------------------------------------------------------ */

/*
 * Each piece: { part, key, geo, uv, spin }. `part` is the named group the
 * garage draws it in, `key` its paint (STRIKER_COLOURS), `uv` how its
 * texture coordinates are laid ('wing' in plan, 'fin' in elevation, 'body'
 * round the fuselage, 'plain' one clean texel), and `spin` true on the
 * prop, which turns about STRIKER_PROP.hub along z.
 */
export function strikerParts({ propulsion = 'prop', antenna = false, seg = 16, kit = {} } = {}) {
  if (!STRIKER_PROPULSION.includes(propulsion)) {
    throw new Error(`strikercraft: no propulsion ${JSON.stringify(propulsion)}`);
  }
  const out = [];
  const add = (part, key, geo, uv, at = [0, 0, 0], rot = [0, 0, 0], spin = false) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) {
      geo.dispose();
    }
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(at[0], at[1], at[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    ));
    layUv(g, uv);
    out.push({ part, key, geo: g, uv, spin });
  };

  /* The fuselage: the nose cap, the dark band behind its seam, the long
   * tube and the tail cone to the engine's mount. */
  add('fuselage', 'nose', latheZ([[0, 0], [0.07, 0.015], [0.12, 0.06], [0.155, 0.15], [BODY_R, CAP_Z - NOSE_Z]], seg), 'plain', [0, 0, NOSE_Z]);
  add('fuselage', 'band', cylZ(BODY_R + 0.002, BODY_R + 0.002, 0.032, seg), 'plain', [0, 0, CAP_Z + 0.07]);
  add('fuselage', 'skin', cylZ(BODY_R, BODY_R, BODY_END_Z - CAP_Z, seg), 'body', [0, 0, (CAP_Z + BODY_END_Z) / 2]);
  add('fuselage', 'skin', latheZ([[BODY_R, 0], [0.15, (TAIL_Z - BODY_END_Z) * 0.6], [0.11, TAIL_Z - BODY_END_Z]], seg), 'body', [0, 0, BODY_END_Z]);
  /* The wing's root fairing, a flattened body along the fuselage's
   * underside where the low wing blends in. */
  const fair = latheZ([[0, 0], [0.10, 0.18], [0.17, 0.55], [0.17, 1.15], [0.12, 1.42], [0.04, 1.52]], seg);
  fair.scale(1.5, 0.55, 1);
  add('fuselage', 'skin', fair, 'body', [0, WING_Y, -0.58]);
  /* A kit's sensor dome (configs/kits.js): a glazed ball turret under the
   * nose cap, its bottom above the skid's so the airframe's box holds. */
  if (kit.nose === 'dome') {
    add('fuselage', 'nose', cylZ(0.045, 0.045, 0.05, seg), 'plain', [0, -0.15, -1.17]);
    add('fuselage', 'band', new THREE.SphereGeometry(0.075, seg, Math.max(6, seg / 2)), 'plain', [0, -0.19, -1.17]);
  }

  /* The cranked delta, low on the fuselage: a steep strake inboard, the
   * main sweep outboard, a straight trailing edge, thinning to the tips. */
  const half = [[0, -0.66], [0.17, -0.56], [0.42, -0.12], [HALF, 0.74], [HALF, TE_Z], [0, TE_Z]];
  const outline = [...half, ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
  const wing = slab(outline, 0.064);
  thinToTips(wing);
  add('wing', 'wing', wing, 'wing', [0, WING_Y, 0]);
  /* The elevons, a lighter strip along the trailing edge, and their
   * horns on top; two hatches over the bays. */
  for (const s of [-1, 1]) {
    const elevon = `elevon-${s < 0 ? 'left' : 'right'}`;
    add(elevon, 'controls', box(0.80, 0.022, 0.15), 'wing', [s * 0.72, WING_Y + 0.006, TE_Z - 0.075]);
    add(elevon, 'fitting', box(0.012, 0.045, 0.035), 'plain', [s * 0.62, WING_Y + 0.035, TE_Z - 0.12]);
    add('wing', 'controls', box(0.20, 0.004, 0.16), 'wing', [s * 0.55, WING_Y + 0.024, 0.22]);
  }

  /* The fins at the tips, above and below the wing, swept, each with its
   * small rudder. */
  /* A kit's swept fins keep the stock root and height and pull the tip
   * back, so they stand inside the stock fins' box. */
  const fin = kit.fins === 'swept'
    ? [[-0.12, 0.66], [-0.12, 1.02], [0.30, 1.10], [0.30, 1.00]]
    : [[-0.12, 0.70], [-0.12, 1.02], [0.30, 1.10], [0.30, 0.88]];
  for (const s of [-1, 1]) {
    const g = slab(fin.map(([y, z]) => [y, z]), FIN_T);
    g.rotateZ(Math.PI / 2);
    add('fins', 'fin', g, 'fin', [s * (HALF + FIN_T / 2), WING_Y, 0]);
    add(`rudder-${s < 0 ? 'left' : 'right'}`, 'rudder', box(FIN_T * 1.3, 0.20, 0.07), 'fin', [s * (HALF + FIN_T / 2), WING_Y + 0.16, 1.05]);
  }

  /* The skid under the belly. */
  add('skid', 'skid', box(0.02, 0.12, 0.03), 'plain', [0, -0.20, 0.25]);
  add('skid', 'skid', box(0.08, 0.012, 0.26), 'plain', [0, -0.265, 0.25]);

  if (propulsion === 'prop') {
    /* A twin piston engine on the tail: a crankcase, two finned cylinders
     * out to the sides, the carburettor and the exhausts. */
    add('engine', 'metal', box(0.16, 0.14, 0.15), 'plain', [0, 0.02, 1.10]);
    for (const s of [-1, 1]) {
      add('engine', 'metal', cylX(0.045, 0.11, 10), 'plain', [s * 0.13, 0.03, 1.10]);
      for (let i = 0; i < 4; i += 1) {
        add('engine', 'dark', cylX(0.058, 0.006, 12), 'plain', [s * (0.095 + i * 0.022), 0.03, 1.10]);
      }
      add('engine', 'dark', box(0.03, 0.03, 0.03), 'plain', [s * 0.19, 0.03, 1.10]);
      add('engine', 'dark', cylZ(0.012, 0.012, 0.14, 6), 'plain', [s * 0.10, -0.05, 1.13]);
    }
    add('engine', 'dark', box(0.05, 0.05, 0.05), 'plain', [0, 0.11, 1.08]);
    add('engine', 'metal', cylZ(0.03, 0.03, 0.06, 10), 'plain', [0, 0, 1.21]);
    /* The prop: two wooden blades and a spinner, turning about the hub. */
    const [hx, hy, hz] = STRIKER_PROP.hub;
    for (const s of [-1, 1]) {
      const blade = propBlade(STRIKER_PROP.r);
      blade.rotateZ(s > 0 ? 0 : Math.PI);
      add('prop', 'wood', blade, 'plain', [hx, hy, hz], [0, 0, 0], true);
    }
    add('prop', 'metal', latheZ([[0.035, 0], [0.03, 0.03], [0, 0.06]], 10), 'plain', [hx, hy, hz - 0.01], [0, 0, 0], true);
  } else {
    /* A small turbojet on the tail: the intake lip, the case with its
     * bands, the nozzle, the mount straps to the fuselage. */
    const y = 0.10;
    add('jet', 'jet', latheZ([[0.095, 0], [0.11, 0.03], [0.12, 0.10], [0.12, 0.34], [0.105, 0.44], [0.085, 0.52]], seg), 'plain', [0, y, 0.84]);
    add('jet', 'nozzle', cylZ(0.07, 0.07, 0.01, seg), 'plain', [0, y, 1.361]);
    add('jet', 'nozzle', cylZ(0.08, 0.08, 0.01, seg), 'plain', [0, y, 0.835]);
    for (const z of [0.98, 1.12]) {
      add('jet', 'metal', cylZ(0.124, 0.124, 0.018, seg), 'plain', [0, y, z]);
    }
    add('jet', 'dark', box(0.05, 0.08, 0.20), 'plain', [0, 0.02, 1.02]);
  }

  if (antenna) {
    add('antenna', 'fitting', box(0.06, 0.012, 0.08), 'plain', [0, BODY_R + 0.004, -0.30]);
    add('antenna', 'antenna', new THREE.CylinderGeometry(0.003, 0.007, 0.36, 6), 'plain', [0, BODY_R + 0.19, -0.30]);
  }
  return out;
}

/* A wooden pusher blade from the hub out along +x, its chord in the disc,
 * widest a third out, given a little twist. Flat in x and y, facing z. */
function propBlade(r) {
  const s = new THREE.Shape();
  s.moveTo(0.02, -0.018);
  s.bezierCurveTo(r * 0.35, -0.040, r * 0.75, -0.030, r, -0.010);
  s.lineTo(r, 0.012);
  s.bezierCurveTo(r * 0.70, 0.026, r * 0.35, 0.034, 0.02, 0.018);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.006);
  g.rotateX(0.25);
  return g;
}

/* The wing thinned toward its tips about its own middle plane. */
function thinToTips(g) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = Math.abs(pos.getX(i));
    pos.setY(i, pos.getY(i) * (1 - 0.6 * Math.min(1, x / HALF)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

/* Texture coordinates by how a piece meets the panels. */
function layUv(g, how) {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u = PLAIN_UV;
    let v = PLAIN_UV;
    if (how === 'wing') {
      u = x / SKIN_TILE;
      v = z / SKIN_TILE;
    } else if (how === 'fin') {
      u = z / SKIN_TILE;
      v = y / SKIN_TILE;
    } else if (how === 'body') {
      /* Round the fuselage from the top, both sides the same way, so the
       * seam of the wrap is a mirror line and not a jump. */
      u = (Math.abs(Math.atan2(x, y)) * BODY_R) / SKIN_TILE;
      v = z / SKIN_TILE;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* ------------------------------------------------------------------ */
/* The panel texture and the prop's spin.                              */
/* ------------------------------------------------------------------ */

/*
 * One repeat of the skin, drawn once: a faintly mottled sheet (a fixed
 * hash, so every machine draws the same), a seam round its edge, rivet
 * rows inside the seams and a stringer line across the middle. White, so
 * the paint multiplies it.
 */
export function strikerSkin(size = 256) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(246,246,246)';
  g.fillRect(0, 0, size, size);
  const cell = size / 16;
  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < 16; j += 1) {
      const h = ((i * 73856093) ^ (j * 19349663)) >>> 0;
      const d = (h % 13) - 6;
      g.fillStyle = `rgb(${240 + d},${240 + d},${242 + d})`;
      g.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  g.fillStyle = 'rgb(150,152,155)';
  g.fillRect(0, 0, size, 2);
  g.fillRect(0, 0, 2, size);
  g.fillStyle = 'rgb(205,207,210)';
  g.fillRect(0, size / 2, size, 1);
  g.fillStyle = 'rgb(170,172,176)';
  const step = size / 20;
  for (let k = 0; k < 20; k += 1) {
    const t = k * step + step / 2;
    for (const [x, y] of [[t, 6], [6, t], [t, size - 6]]) {
      g.beginPath();
      g.arc(x, y, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/*
 * A cel material that turns the vertices marked `aSpin` about the prop's
 * hub by `uniforms.uSpin`, positions and normals, before anything else
 * sees them: so an instanced Striker's prop turns with no draw call of its
 * own. Wraps the cel material's own onBeforeCompile, as finish.js does.
 */
export function strikerSpin(mat) {
  const uniforms = { uSpin: { value: 0 }, uHub: { value: new THREE.Vector3(...STRIKER_PROP.hub) } };
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSpin;
        uniform float uSpin;
        uniform vec3 uHub;
        vec2 spinXY(vec2 p) {
          float c = cos(uSpin);
          float s = sin(uSpin);
          return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (aSpin > 0.5) { objectNormal.xy = spinXY(objectNormal.xy); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aSpin > 0.5) { transformed.xy = spinXY(transformed.xy - uHub.xy) + uHub.xy; }`);
    if (!shader.vertexShader.includes('spinXY(transformed')) {
      throw new Error('strikercraft: the vertex shader changed and the spin did not land');
    }
  };
  mat.customProgramCacheKey = () => `${baseKey()}|striker-spin`;
  return uniforms;
}

/*
 * The war's drawing: every piece merged into one geometry, its colour in
 * its vertices and `aSpin` on the prop's. For src/render/attackers.js.
 */
/* Each part's heat in a thermal picture (src/render/thermal.js's per
 * vertex `thermal`, in units of 110 degrees over the skin): the piston
 * engine's cylinders and exhaust, a turbojet's case hotter still, the
 * fuselage a little warm from the engine bay. */
const WAR_HEAT = {
  engine: 1, jet: 2.5, fuselage: 0.03,
};

export function strikerWarGeometry(opts = {}) {
  const pieces = strikerParts(opts);
  const geos = pieces.map(({
    part, key, geo, spin,
  }) => {
    const n = geo.attributes.position.count;
    const c = new THREE.Color(STRIKER_COLOURS[key]);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSpin', new THREE.BufferAttribute(new Float32Array(n).fill(spin ? 1 : 0), 1));
    geo.setAttribute('thermal', new THREE.BufferAttribute(new Float32Array(n).fill(WAR_HEAT[part] ?? 0), 1));
    return geo;
  });
  const g = mergeGeometries(geos, false);
  if (!g) {
    throw new Error('strikercraft: the war geometry did not merge');
  }
  for (const p of geos) {
    p.dispose();
  }
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* The garage's drawing.                                               */
/* ------------------------------------------------------------------ */

/* The paint keys a repaint takes along, by region (configs/liveries.js
 * striker2500, in this order): each region one colour as built, its shades
 * following it. The engine is the piston engine with the prop's spinner or
 * the turbojet, whichever is fitted, by the metal both carry, so the two
 * engines paint by the same regions. The wooden blades, the skid, the
 * horns and the whip are left as they are. */
const REGIONS = {
  fuselage: { base: 'skin', shades: [] },
  wing: { base: 'wing', shades: ['controls'] },
  fins: { base: 'fin', shades: ['rudder'] },
  nose_cap: { base: 'nose', shades: [] },
  nose_band: { base: 'band', shades: [] },
  engine: { base: 'metal', shades: ['dark', 'jet', 'nozzle'] },
};

/*
 * Where decals go, each a configs/paint.js decal's p, n and largest s: the
 * nose, each wing's top, each fin's outer face and each side of the
 * fuselage. Named one a side, so the garage can put a different thing on
 * each; `mirror` is false for that reason.
 */
function strikerSurfaces() {
  const wingTop = WING_Y + 0.032 * (1 - 0.6 * (0.7 / HALF));
  return [
    { id: 'nose', p: [0, 0.158, NOSE_Z + 0.22], n: [0, 0.97, -0.25], size: 0.14, mirror: false },
    { id: 'wing-top-left', p: [-0.70, wingTop, 0.55], n: [0, 1, 0], size: 0.30, mirror: false },
    { id: 'wing-top-right', p: [0.70, wingTop, 0.55], n: [0, 1, 0], size: 0.30, mirror: false },
    { id: 'fin-left', p: [-(HALF + FIN_T), WING_Y + 0.08, 0.92], n: [-1, 0, 0], size: 0.15, mirror: false },
    { id: 'fin-right', p: [HALF + FIN_T, WING_Y + 0.08, 0.92], n: [1, 0, 0], size: 0.15, mirror: false },
    { id: 'fuselage-left', p: [-BODY_R, 0.03, -0.45], n: [-1, 0, 0], size: 0.18, mirror: false },
    { id: 'fuselage-right', p: [BODY_R, 0.03, -0.45], n: [1, 0, 0], size: 0.18, mirror: false },
  ];
}

/* Where each moving surface hinges, in the model frame: an elevon on its
 * leading edge across the wing, a rudder on its leading edge up the fin. */
export const STRIKER_HINGES = {
  'elevon-left': [-0.72, WING_Y + 0.006, TE_Z - 0.15],
  'elevon-right': [0.72, WING_Y + 0.006, TE_Z - 0.15],
  'rudder-left': [-(HALF + FIN_T / 2), WING_Y + 0.16, 1.015],
  'rudder-right': [HALF + FIN_T / 2, WING_Y + 0.16, 1.015],
};

/* The one prop turns positive about the body's forward axis, as the
 * Zagi's and the Bramor's do; the other three slots are empty. */
export const STRIKER_PROP_SPIN = [1, 0, 0, 0];

/*
 * Build the Striker for the garage and for a pilot to fly: one aircraft,
 * seen close in the hangar and the chase camera. `propulsion` 'prop' or 'jet',
 * `antenna` the whip; and every builder's name, fog, lite and worldScale.
 * Returns the shell's contract (group, discs, blades, cameraMount,
 * propSpin, stator, setSurfaces, all four rotor slots long, as the Zagi's)
 * and `combat`: { propulsion, antenna, parts, paint } with the hook of
 * src/render/combatpaint.js.
 */
export function buildStrikerCraft(opts = {}) {
  const propulsion = opts.propulsion ?? 'prop';
  const antenna = Boolean(opts.antenna);
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  /* The flown and the garage's Striker is one aircraft seen close, so it
   * is drawn rounder than the war's (strikerWarGeometry's 16). */
  const pieces = strikerParts({ propulsion, antenna, seg: lite ? 12 : 24, kit: opts.kit ?? {} });
  const skin = strikerSkin(lite ? 128 : 256);
  const mats = {};
  for (const [key, hex] of Object.entries(STRIKER_COLOURS)) {
    mats[key] = celMaterial({ color: hex, map: skin, key: 'striker-skin', fog, cloudShadow: 0, rim: 0.30, spec: key === 'nose' ? 0.6 : 0.4, specWidth: 0.02 });
  }
  const coat = paintRegions();
  for (const [id, r] of Object.entries(REGIONS)) {
    coat.base(id, mats[r.base]);
    for (const k of r.shades) {
      coat.shade(id, mats[k]);
    }
  }

  const group = new THREE.Group();
  group.name = opts.name ?? 'striker';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  /* Each part a group, a mesh a material in it; the prop's pieces go in a
   * rotor the shell turns, laid so its own y is the fore and aft axis. */
  const parts = {};
  const byPart = new Map();
  for (const p of pieces) {
    if (!byPart.has(p.part)) {
      byPart.set(p.part, new Map());
    }
    const m = byPart.get(p.part);
    if (!m.has(p.key)) {
      m.set(p.key, []);
    }
    m.get(p.key).push(p.geo);
  }
  const [hx, hy, hz] = STRIKER_PROP.hub;
  const toRotor = new THREE.Matrix4().makeTranslation(-hx, -hy, -hz).premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const blades = [];
  const discs = [];
  for (const [part, byKey] of byPart) {
    const g = new THREE.Group();
    g.name = part;
    for (const [key, list] of byKey) {
      const geo = mergeGeometries(list, false);
      for (const x of list) {
        x.dispose();
      }
      if (part === 'prop') {
        geo.applyMatrix4(toRotor);
      } else if (STRIKER_HINGES[part]) {
        const [x, y, z] = STRIKER_HINGES[part];
        geo.translate(-x, -y, -z);
      }
      const mesh = new THREE.Mesh(geo, mats[key]);
      mesh.name = `${part}-${key}`;
      mesh.castShadow = !lite;
      g.add(mesh);
    }
    if (part === 'prop') {
      const mount = new THREE.Group();
      mount.name = 'prop-mount';
      mount.position.set(hx, hy, hz);
      mount.rotation.x = -Math.PI / 2;
      mount.add(g);
      group.add(mount);
      blades.push(g);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(STRIKER_PROP.r, STRIKER_PROP.r, 0.002, lite ? 16 : 28),
        new THREE.MeshBasicMaterial({ color: 0x8a6a40, transparent: true, opacity: 0.12, depthWrite: false, fog }),
      );
      disc.renderOrder = 1;
      mount.add(disc);
      discs.push(disc);
    } else {
      if (STRIKER_HINGES[part]) {
        g.position.set(...STRIKER_HINGES[part]);
      }
      group.add(g);
    }
    parts[part] = g;
  }
  while (blades.length < 4) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }
  const cameraMount = new THREE.Group();
  cameraMount.name = 'striker-camera-mount';
  cameraMount.position.set(0, 0, NOSE_Z + 0.05);
  group.add(cameraMount);

  const craft = {
    group,
    discs,
    blades,
    leds: [],
    cameraMount,
    stator: mats.metal,
    propSpin: STRIKER_PROP_SPIN,
    /*
     * The surfaces, radians, the shell's order for a flying wing: left and
     * right elevon (positive is trailing edge up, as the Zagi's), the third
     * slot unused, and the rudders together (positive is trailing edge
     * left). The war's Striker flies a route and keeps them still.
     */
    setSurfaces(left = 0, right = 0, _elevator = 0, rudder = 0) {
      parts['elevon-left'].rotation.x = -left;
      parts['elevon-right'].rotation.x = -right;
      parts['rudder-left'].rotation.y = -rudder;
      parts['rudder-right'].rotation.y = -rudder;
    },
    combat: { propulsion, antenna, parts },
  };
  craft.combat.paint = paintHook(craft, coat, strikerSurfaces());
  return craft;
}

/* ------------------------------------------------------------------ */
/* The launch rail.                                                    */
/* ------------------------------------------------------------------ */

/* The rail's box section, metres: shallow enough that the 30 in pusher's
 * lower blade, 0.36 m under the CG, clears its top. */
const RAIL_W = 0.08;
const RAIL_H = 0.05;
/* How far the rail runs on past the release point, under the nose. */
const RAIL_LEAD = 0.15;

/* A tube from a to b, as a geometry in the frame a and b are in. */
function tubeGeo(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyMatrix4(new THREE.Matrix4().compose(
    a.clone().addScaledVector(d, 0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}

/* A box of size [w, h, d] with its centre at `at`, as a geometry. */
function boxAt(size, at) {
  return box(...size).translate(at.x, at.y, at.z);
}

/*
 * THE LAUNCH RAIL the Striker is shot off, `rail` STRIKER_RAIL
 * (configs/airframes.js): the full size machine's ground launcher, a steel
 * box section rail on an A-frame, its foot on the ground, with the
 * pneumatic ram under it that strokes the shuttle, and the shoe the belly
 * skid sits in. Built about the CG and added to `craft.group`, so it is
 * called once the drawing has been moved onto the CG (src/render/craft.js)
 * and reads where the skid is from the parts as they then stand: the
 * piston and the turbojet Striker hang their skid at slightly different
 * depths, and each sits on the same rail.
 *
 * Its numbers are the rail's, with no new ones about where the aircraft
 * leaves it: the release point is on the rail straight under the CG, the
 * rail runs `railLength` aft and down from there at `pitchDeg`, and its
 * underside's aft corner is on the ground, `height` under the CG, which
 * sets how far under the belly the rail runs. That is the Bramor's
 * catapult's rule (src/render/bramorcraft.js), and scripts/craft-check.js
 * measures both against their numbers in the parked shell.
 *
 * Built level, as the Bramor's is, and turned by minus the rail's pitch,
 * so that as a child of the aircraft pitched up on the rail it stands
 * level on the ground; what lies along the rail is built square in the
 * aircraft's own frame inside it. Named 'launcher' and hidden; the shell
 * shows it (src/main.js). Sets craft.launcher and craft.launcherRest.
 */
export function buildStrikerLauncher(craft, rail, opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const seg = lite ? 6 : 10;
  const theta = (rail.pitchDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const steel = celMaterial({ color: 0x4d5247, fog, cloudShadow: 0, rim: 0.22, spec: 0.30, specWidth: 0.02 });
  const dark = celMaterial({ color: 0x2b2d2f, fog, cloudShadow: 0, rim: 0.20, spec: 0.35, specWidth: 0.02 });

  /* The skid's foot and its length, in the aircraft's frame. */
  const skid = craft.combat.parts.skid;
  const foot = new THREE.Box3();
  for (const m of skid.children) {
    m.geometry.computeBoundingBox();
    foot.union(m.geometry.boundingBox);
  }
  foot.translate(skid.position);

  /* The rail's underside runs `under` beneath the CG, perpendicular to the
   * aircraft, so that `railLength` aft of the release point it meets the
   * ground `height` down: under cos + railLength sin = height. */
  const under = (rail.height - rail.railLength * sin) / cos;
  const top = under - RAIL_H;
  if (top <= -foot.min.y) {
    throw new Error(`strikercraft: the rail's top, ${top.toFixed(3)} m under the CG, is not under the skid's foot, ${(-foot.min.y).toFixed(3)} m`);
  }

  const g = new THREE.Group();
  g.name = 'launcher';
  const along = new THREE.Group();
  along.rotation.x = theta;
  g.add(along);

  /* Along the rail, in the aircraft's frame: z aft, y up. */
  const railLen = rail.railLength + RAIL_LEAD;
  const beam = new THREE.Mesh(box(RAIL_W, RAIL_H, railLen), steel);
  beam.name = 'rail';
  beam.position.set(0, -under + RAIL_H / 2, rail.railLength - railLen / 2);
  beam.castShadow = !lite;
  along.add(beam);
  const zc = (foot.min.z + foot.max.z) / 2;
  const shoeH = top + foot.min.y;
  const ramR = 0.032;
  const ram = mergeGeometries([
    /* The shoe: a shuttle on the rail with the skid in its saddle. */
    boxAt([0.11, shoeH, foot.max.z - foot.min.z + 0.06], new THREE.Vector3(0, foot.min.y - shoeH / 2, zc)),
    boxAt([RAIL_W + 0.03, 0.03, 0.34], new THREE.Vector3(0, -top + 0.005, zc)),
    /* The ram under the rail, on two hangers, from 0.3 m below the
     * release point to where it would meet the ground. */
    tubeGeo(new THREE.Vector3(0, -under - ramR - 0.02, 0.3), new THREE.Vector3(0, -under - ramR - 0.02, rail.railLength - 0.6), ramR, seg),
    boxAt([0.03, 0.04, 0.03], new THREE.Vector3(0, -under - 0.02, 0.4)),
    boxAt([0.03, 0.04, 0.03], new THREE.Vector3(0, -under - 0.02, rail.railLength - 0.7)),
  ], false);
  const ramMesh = new THREE.Mesh(ram, dark);
  ramMesh.castShadow = !lite;
  along.add(ramMesh);

  /* On the ground, level: the A-frame from a third of the way down the
   * rail, splayed forward to two feet, a brace across it, a base frame
   * from the feet back to the rail's foot, and the air bottle on it. */
  const ground = -rail.height;
  const craftDown = new THREE.Vector3(0, -cos, -sin);
  const railDir = new THREE.Vector3(0, -sin, cos);
  const onRail = (s) => craftDown.clone().multiplyScalar(under).addScaledVector(railDir, s);
  const hip = onRail(rail.railLength / 3);
  const railFoot = onRail(rail.railLength);
  /* Each leg ends on a pad on the base frame, whose top is 40 mm up: a
   * tube's end cut square to the slanting leg would dip into the ground. */
  const feet = [-1, 1].map((s) => new THREE.Vector3(s * 0.55, ground + 0.04, hip.z - 0.35));
  const legR = 0.025;
  const mid = (a, b, t) => a.clone().lerp(b, t);
  const frame = [
    ...feet.map((f) => tubeGeo(hip, f, legR, seg)),
    ...feet.map((f) => boxAt([0.10, 0.02, 0.10], new THREE.Vector3(f.x, ground + 0.03, f.z))),
    tubeGeo(mid(hip, feet[0], 0.55), mid(hip, feet[1], 0.55), legR * 0.8, seg),
    ...feet.map((f) => boxAt([0.06, 0.04, railFoot.z - f.z], new THREE.Vector3(f.x, ground + 0.02, (f.z + railFoot.z) / 2))),
    boxAt([1.16, 0.04, 0.06], new THREE.Vector3(0, ground + 0.02, railFoot.z - 0.03)),
    boxAt([1.16, 0.04, 0.06], new THREE.Vector3(0, ground + 0.02, feet[0].z)),
  ];
  const frameMesh = new THREE.Mesh(mergeGeometries(frame, false), steel);
  frameMesh.castShadow = !lite;
  g.add(frameMesh);
  const bottle = new THREE.Mesh(cylZ(0.09, 0.09, 0.7, seg).translate(0.32, ground + 0.09, railFoot.z - 0.55), dark);
  bottle.castShadow = !lite;
  g.add(bottle);

  g.rotation.x = -theta;
  g.visible = false;
  craft.group.add(g);
  craft.launcher = g;
  craft.launcherRest = { position: g.position.clone(), quaternion: g.quaternion.clone() };
  return g;
}
