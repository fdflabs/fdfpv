/*
 * scene.js: the race gates the in-sim builder stands in a world, and the
 * sky dome the Alps draw behind them.
 *
 * A gate is a group in its own frame, in three.js axes: x across the
 * opening, y up from the base, z through it. It holds a PVC frame on
 * weighted feet, printed vinyl sleeves and a header carrying the gate's
 * number, the lit target the pilot aims at, and any header pennants. It
 * comes back with the capsules the craft meets, in the same frame, and
 * the handles dressGate, lightTarget and colourTargetSide repaint every
 * frame. The caller places it, owns it and frees it. src/render/pylons.js
 * builds the pylons and hoops from the same lit target and number badge.
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
import { celMaterial, outlineHull, FLAG_SAIL_CLOTH } from './celmat.js';
import { BUILT_FRAME_TUBE_OD } from '../game/track.js';
import {
  BANNER_SIZE, bannerCanvas, bannerHex, GATE_BANNER_H, HEADER_NUMBER_ZONE,
  paintGateHeader, paintGateSleeve, paintFlagSailPair, flagMast, flagSailProfile,
} from '../art/banners.js';

/*
 * The colours a gate's lit opening takes. Every gate rests in GATE_COLOUR
 * and the start and finish gate in START_COLOUR, so the timing plane is
 * found before anything is lit. Only the gate the race wants next is lit
 * for real: ON_LINE seen from the side it is flown from, OFF_LINE from the
 * other, so there is one lit thing on the course at a time.
 */
export const GATE_COLOUR = 0xffd45c;
export const START_COLOUR = 0x7dffb4;
const ON_LINE = 0x39ff8b;
const OFF_LINE = 0xff5a5a;

/* How much the 'follow' tier dims a ring: the builder dims every gate it
 * is not pointing at with it. */
const FOLLOW_DIM = 0.42;

/*
 * Lit parts go on layer 1, which the outline prepass in src/render/post.js
 * does not draw: an inked edge inside a glowing bar reads as a defect on
 * the one prop the pilot looks at all lap.
 */
const LIT_LAYER = 1;

/* ------------------------------------------------------------------ */
/* What a gate is made of                                              */
/* ------------------------------------------------------------------ */

/*
 * The materials every gate shares, made on first use. Sharing is what lets
 * the scenery merger fold the frames, boards and numerals of a whole
 * course into a handful of draw calls, and it is why disposeStandaloneGate
 * leaves them alone. An unkeyed cel material is bucketed by its options as
 * JSON, so the option order here is part of the bucket name.
 *
 * Creation order matters too: three draws opaque meshes sorted by material
 * id, and at range a print and the board 4 mm behind it share a depth, so
 * the order they were made in decides which one shows. The prints are made
 * before these (standaloneGate asks for them first) and the vinyl first of
 * these.
 */
let looks = null;
function gateLooks() {
  looks ??= {
    /* The white board behind every print. */
    vinyl: celMaterial({ color: bannerHex('vinyl'), rim: 0.22 }),
    /* Aluminium: light enough to read as tube in sunlight, still darker
     * than the sky. */
    tube: celMaterial({ color: 0x9aa2b0, rim: 0.26 }),
    /* A shade darker than the tube, so a corner reads as a fitting
     * somebody assembled rather than tube bent round. */
    joint: celMaterial({ color: 0x767f8f, rim: 0.26 }),
    /* Webbing tape: the roundel the number sits on. */
    tape: celMaterial({ color: 0xe4d9bf, rim: 0.18 }),
    /* Unlit, so neither shadow nor distance can take a gate's number
     * away from a pilot counting them down. */
    ink: new THREE.MeshBasicMaterial({ color: 0x18202f }),
  };
  return looks;
}

/*
 * The one print set every builder gate wears: header, sleeve, the sleeve
 * painted mirrored for the far leg, and a navy and a red pennant. The
 * keys name the set, so every gate's header falls in one scenery bucket.
 */
const PRINT_SET = 'standalone';
let prints = null;
function plainPrints() {
  if (prints) {
    return prints;
  }
  const painted = ([w, h], paint, opts) => {
    const canvas = bannerCanvas(w, h);
    paint(canvas.getContext('2d'), w, h, opts);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  /* Nearly no rim on a print: a flat sheet is edge on to the rim term
   * across its whole face, and any strength tints the print one cool
   * colour. FrontSide because each face is its own plane, and DoubleSide
   * is what the outline prepass cannot see. */
  const vinylPrint = (tex, name) => celMaterial({
    color: 0xffffff, rim: 0.06, map: tex, side: THREE.FrontSide, key: `${name}:${PRINT_SET}`,
  });
  /* No rim on cloth at all: a near flat sail is edge on from anywhere and
   * the rim colour covered the whole flag. FrontSide, because the sail
   * geometry carries its own reverse faces (sailGeometry). */
  const pennant = (accent) => celMaterial({
    color: 0xffffff,
    rim: 0.0,
    map: painted(BANNER_SIZE.sailSheet, paintFlagSailPair, { accent }),
    side: THREE.FrontSide,
    cloth: FLAG_SAIL_CLOTH,
    key: `sail0:${accent}:${PRINT_SET}`,
  });
  prints = {
    header: vinylPrint(painted(BANNER_SIZE.header, paintGateHeader, {}), 'hdr0'),
    sleeve: vinylPrint(painted(BANNER_SIZE.sleeve, paintGateSleeve, {}), 'slv0'),
    sleeveMirrored: vinylPrint(painted(BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }), 'slvf0'),
    pennants: [pennant('navy'), pennant('red')],
  };
  return prints;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/*
 * A dot matrix font, three dots wide and five tall, one digit per entry:
 * each row is three bits, the top row in the high bits and the left dot
 * in each row's high bit. Built from dots rather than printed so a course
 * of numbered gates still shares one header texture.
 */
const FONT = [0x7b6f, 0x2c97, 0x73e7, 0x73cf, 0x5bc9, 0x79cf, 0x79ef, 0x7292, 0x7bef, 0x7bcf];

/* The lit dots of a whole number in reading order, digit by digit, row by
 * row: `col` counts across the number with one blank column between
 * digits, `cols` is how many columns it spans. */
function numeralDots(n) {
  const digits = String(Math.max(0, Math.round(n)));
  const dots = [];
  for (let i = 0; i < digits.length; i += 1) {
    const bits = FONT[digits.charCodeAt(i) - 48];
    for (let cell = 0; cell < 15; cell += 1) {
      if ((bits >> (14 - cell)) & 1) {
        dots.push({ col: i * 4 + (cell % 3), row: Math.floor(cell / 3) });
      }
    }
  }
  return { dots, cols: digits.length * 4 - 1 };
}

/*
 * A number as raised dots on both faces of a plate centred at x = x0,
 * `pitch` apart. The back face is mirrored, as a double sided print is,
 * so gate 12 does not read as 21 from behind.
 */
function addNumeral(group, n, x0, dot, pitch, thick, faceZ, mat) {
  const { dots, cols } = numeralDots(n);
  const mid = (cols - 1) * 0.5;
  for (const { col, row } of dots) {
    const across = (col - mid) * pitch;
    for (const face of [-1, 1]) {
      const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, thick), mat);
      pip.position.set(x0 + face * across, (2 - row) * pitch, face * faceZ);
      group.add(pip);
    }
  }
  return cols;
}

/* A disc facing along z, at x along its plate. */
function addDisc(group, r, depth, segments, mat, x) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, segments), mat);
  disc.rotation.x = Math.PI * 0.5;
  disc.position.set(x, 0, 0);
  group.add(disc);
}

/*
 * A small number plate: a pale disc with a dark edge and the number on
 * both faces. `scale` sizes all of it together, disc, dots and the gap
 * the caller leaves, so a badge on a small opening is a small badge
 * rather than a big one floating off it.
 */
export function openingBadge(n, scale = 1) {
  const look = gateLooks();
  const badge = new THREE.Group();
  const r = 0.15 * scale;
  addDisc(badge, r, 0.04 * scale, 16, look.tape, 0);
  addDisc(badge, r * 1.14, 0.03 * scale, 16, look.ink, 0);
  addNumeral(badge, n, 0, 0.028 * scale, 0.034 * scale, 0.02, 0.028, look.ink);
  return badge;
}

/* ------------------------------------------------------------------ */
/* Printed sheets                                                      */
/* ------------------------------------------------------------------ */

/*
 * A vinyl board with its print on a plane each side, the back one turned
 * so the design reads the right way round from behind. Not one textured
 * box: a box maps the print onto its thin edges too, and the top edge is
 * what a pilot looks down on.
 */
function printedSheet(w, h, depth, print) {
  const sheet = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), gateLooks().vinyl);
  board.castShadow = true;
  sheet.add(board);
  for (const face of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), print);
    side.position.z = face * (depth * 0.5 + 0.004);
    if (face < 0) {
      side.rotation.y = Math.PI;
    }
    sheet.add(side);
  }
  return sheet;
}

/*
 * A sheet's collider: a row of thin capsules along its long axis rather
 * than one fat one. One capsule wide enough to cover a sheet is as thick
 * as it is wide, a third of a metre of air in front of the print that a
 * line clearing it would still hit. SHEET_CAP_R is comfortably thicker
 * than any sheet, so the row is never porous.
 *
 * Gate sheets are MultiGP's vinyl mesh panels, and vinyl is PVC: the
 * surface tells src/game/crashworld.js so, where an obstacle of no stated
 * material would meet the craft as concrete.
 */
const SHEET_CAP_R = 0.08;
const SHEET_SURFACE = 'pvc';

function capsule(kind, ax, ay, az, bx, by, bz, r) {
  return { kind, ax, ay, az, bx, by, bz, r };
}

function sheetCaps(cx, cy, halfAlong, halfAcross, upright) {
  const width = halfAcross * 2;
  const n = Math.max(1, Math.ceil(width / (SHEET_CAP_R * 2)));
  const caps = [];
  for (let i = 0; i < n; i += 1) {
    const off = (i + 0.5) * (width / n) - halfAcross;
    const cap = upright
      ? capsule('obstacle', cx + off, cy - halfAlong, 0, cx + off, cy + halfAlong, 0, SHEET_CAP_R)
      : capsule('obstacle', cx - halfAlong, cy + off, 0, cx + halfAlong, cy + off, 0, SHEET_CAP_R);
    cap.surface = SHEET_SURFACE;
    caps.push(cap);
  }
  return caps;
}

/*
 * The header: one printed sheet across the whole structure, as a race
 * gate's is, with the gate's number on a roundel in the clear zone the
 * print leaves at its end. The roundel is sized to hold the numeral (its
 * corner dot, plus a margin), so a two digit number stays on its disc.
 */
function headerBoard(index, outerW) {
  const look = gateLooks();
  const w = Math.max(0.9, outerW);
  const h = GATE_BANNER_H;
  const DOT = 0.048;
  const PITCH = 0.058;
  const board = new THREE.Group();
  board.add(printedSheet(w, h, 0.05, plainPrints().header));
  const { cols } = numeralDots(index);
  const reach = Math.hypot((cols - 1) * 0.5 * PITCH + DOT * 0.5, 2 * PITCH + DOT * 0.5);
  const r = Math.min(h * 0.40, reach + 0.03);
  const x = -(w * (0.5 - HEADER_NUMBER_ZONE * 0.5));
  addDisc(board, r, 0.062, 20, look.tape, x);
  /* A dark edge: a pale disc on a white board reads as a hole in it. */
  addDisc(board, r * 1.14, 0.05, 20, look.ink, x);
  addNumeral(board, index, x, DOT, PITCH, 0.03, 0.046, look.ink);
  board.userData.halfW = w * 0.5;
  board.userData.r = h * 0.5;
  return board;
}

/* ------------------------------------------------------------------ */
/* The lit target                                                      */
/* ------------------------------------------------------------------ */

const PLANE_UV_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * The glow across an opening: a soft band on the square's edge and a
 * faint wash inside it. The band is what a pilot aims at close in; the
 * wash is what still reads at fifty metres, when the band round a 1.75 m
 * hole is a few pixels. Additive so it reads as light, unfogged so
 * distance cannot take the target away. pow() of a signed base stays as
 * it is: changing it to a product would change what each driver draws.
 */
const SQUARE_GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uFront;
  uniform vec3 uBack;
  uniform float uGain;
  uniform float uEdge;
  uniform float uFill;
  varying vec2 vUv;
  void main() {
    vec2 p = abs(vUv - 0.5);
    float reach = max(p.x, p.y);
    float edge = exp(-pow((reach - uEdge) / 0.055, 2.0));
    float wash = smoothstep(uEdge, 0.0, reach) * uFill;
    vec3 tint = gl_FrontFacing ? uFront : uBack;
    gl_FragColor = vec4(tint * (edge + wash) * uGain, 1.0);
  }
`;

/*
 * The pane in the opening, seen only on the gate the race wants next.
 * The wrong face also wears a cross, because red against green is the
 * one pair a colour blind pilot cannot tell, and this pane says which
 * way through. The right face stays clear: the line beyond it is what
 * the pilot is looking at.
 */
const CUE_FRAGMENT = /* glsl */ `
  uniform vec3 uFront;
  uniform vec3 uBack;
  uniform float uOpacity;
  uniform float uWrong;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float diagonal = min(abs(p.x - p.y), abs(p.x + p.y)) * 1.41421356;
    float stroke = smoothstep(0.055, 0.028, diagonal) * step(max(abs(p.x), abs(p.y)), 0.44);
    float alpha = mix(uOpacity, min(0.72, uOpacity + 0.42 * stroke), uWrong);
    gl_FragColor = vec4(gl_FrontFacing ? uFront : uBack, alpha);
  }
`;

/*
 * The lit bar's thickness, a legibility figure: 0.16 m is 3 px at 20 m and
 * 2 px at 30 m on a 900 px frame, the thinnest that survives the distance
 * a racer commits to a line from. Close in it is chunky; a target that
 * cannot be seen until 7 m is no target.
 */
const BAR = 0.16;

/* The four bars just inside an opening centred at height cy, as
 * [x, y, width, height]: the lit line is the clear opening itself. */
function openingBars(cy, w, h) {
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  return [
    [0, cy + halfH - BAR * 0.5, w, BAR],
    [0, cy - halfH + BAR * 0.5, w, BAR],
    [-halfW + BAR * 0.5, cy, BAR, h],
    [halfW - BAR * 0.5, cy, BAR, h],
  ];
}

function mergedBoxes(bars, grow, pad, depth) {
  return mergeGeometries(bars.map(([x, y, w, h]) => {
    const box = new THREE.BoxGeometry(w * grow + pad, h * grow + pad, depth);
    box.translate(x, y, 0);
    return box;
  }), false);
}

function litMesh(group, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.layers.set(LIT_LAYER);
  group.add(mesh);
  return mesh;
}

/*
 * The lit target on an obstacle's openings, added to `group` in its own
 * frame: per opening a ring of bars and a halo round it, then one glow
 * and one cue pane on the primary opening. One mesh per opening so a
 * stack lights only the hole the race names; one ring material and one
 * halo material for the whole structure, which is what the dressing
 * functions colour. `primaryWanted` names the opening (clamped to the
 * stack); unnamed, it is the middle one.
 */
export function apertureMarkers(group, sills, clearW, clearH, stack, isStart, primaryWanted) {
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;
  const primary = primaryWanted == null
    ? Math.floor(stack / 2)
    : Math.max(0, Math.min(stack - 1, Math.round(primaryWanted)));
  const ringMat = new THREE.MeshBasicMaterial({ color: ringColor, fog: true });
  const haloMat = new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.5, fog: true });
  const rings = [];
  const halos = [];
  for (let k = 0; k < stack; k += 1) {
    const bars = openingBars(sills[k] + clearH * 0.5, clearW, clearH);
    rings.push(litMesh(group, mergedBoxes(bars, 1, 0, BAR), ringMat));
    halos.push(litMesh(group, mergedBoxes(bars, 1.06, 0.05, BAR * 0.7), haloMat));
  }

  /* 2.6 times the opening: the glow is how a racer finds the next gate
   * from far off. uEdge puts the band on the opening's edge whatever its
   * size. */
  const span = Math.max(clearW, clearH) * 2.6;
  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uFront: { value: new THREE.Color(ringColor) },
      uBack: { value: new THREE.Color(ringColor) },
      uGain: { value: 0.1 },
      uEdge: { value: (clearW * 0.5) / span },
      uFill: { value: 0.16 },
    },
    vertexShader: PLANE_UV_VERTEX,
    fragmentShader: SQUARE_GLOW_FRAGMENT,
  });
  const centreY = sills[primary] + clearH * 0.5;
  const glow = litMesh(group, new THREE.PlaneGeometry(span, span), glowMat);
  glow.position.y = centreY;
  const cue = gateCue(clearW, clearH);
  cue.position.y = centreY;
  group.add(cue);
  return {
    ring: rings[0], halo: halos[0], rings, halos, glow, cue, fillMat: cue.userData.fillMat, ringColor, primary,
  };
}

/*
 * The cue pane for an opening clearW by clearH, or a disc clearW across
 * when `round` (a sky hoop, src/render/pylons.js). Hidden until the race
 * names its gate. Double sided and indifferent to which way it was
 * built: colourTargetSide colours it from outside, off which side of the
 * gate the camera is, so a reverse or a split S reads the same.
 */
export function gateCue(clearW, clearH, round = false) {
  const pane = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uFront: { value: new THREE.Color(ON_LINE) },
      uBack: { value: new THREE.Color(OFF_LINE) },
      uOpacity: { value: 0.22 },
      uWrong: { value: 0 },
    },
    vertexShader: PLANE_UV_VERTEX,
    fragmentShader: CUE_FRAGMENT,
  });
  const shape = round
    ? new THREE.CircleGeometry(clearW * 0.47, 64)
    : new THREE.PlaneGeometry(clearW * 0.94, clearH * 0.94);
  const cue = new THREE.Group();
  litMesh(cue, shape, pane);
  cue.layers.set(LIT_LAYER);
  cue.visible = false;
  cue.userData.fillMat = pane;
  return cue;
}

/* ------------------------------------------------------------------ */
/* Pennants                                                            */
/* ------------------------------------------------------------------ */

/*
 * A feather flag's mast: rings round the bent centreline from
 * src/art/banners.js, its radius tapering with it, which a TubeGeometry
 * (one radius) cannot do. The centreline lies in the xy plane, so each
 * ring's frame is exact: the tangent turned a quarter in plane, and z.
 * The origin is the butt, which the sail shares.
 */
const MAST_SIDES = 5;

function mastGeometry(poleR, h) {
  const { points } = flagMast(h);
  const last = points.length - 1;
  const position = [];
  const uv = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(last, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const r = poleR * p.r;
    for (let k = 0; k < MAST_SIDES; k += 1) {
      const turn = (k / MAST_SIDES) * Math.PI * 2;
      const c = Math.cos(turn);
      position.push(p.x + -ty * c * r, p.y + tx * c * r, Math.sin(turn) * r);
      /* Nothing samples this uv, but the scenery merger only merges
       * geometries with the same attributes, and the gate tubes beside
       * this mast in its bucket carry one. */
      uv.push(k / MAST_SIDES, i / last);
    }
  });
  const index = [];
  for (let i = 0; i < last; i += 1) {
    const ring = i * MAST_SIDES;
    for (let k = 0; k < MAST_SIDES; k += 1) {
      const a = ring + k;
      const b = ring + ((k + 1) % MAST_SIDES);
      index.push(a, a + MAST_SIDES, b, b, a + MAST_SIDES, b + MAST_SIDES);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/*
 * A sail: a grid of rows up the mast (flagSailProfile's, so the print has
 * the same metres per row in the body and the swept corner) by five
 * columns out from it, the seam on the mast's centreline.
 *
 * Two sheets of the same vertices, wound opposite ways, so the sail is a
 * two sided surface every pass agrees on: the outline prepass overrides
 * materials with a FrontSide one, and a DoubleSide sail seen from behind
 * wrote no depth there and came out see through. The reverse sheet has
 * its own vertices only for its own uv, which reads the other half of
 * the printed sheet so the mark is the right way round from both sides
 * (paintFlagSailPair). It shares the front's normals rather than
 * flipping them: the cloth wave in celmat.js moves vertices along their
 * normal, and flipped normals would pull the two sheets apart.
 */
const SAIL_COLS = 5;

function sailGeometry(poleR, h) {
  const { rows } = flagSailProfile(h);
  const sheet = [];
  const cloth = [];
  const uvFacingAway = [];
  const uvFacingViewer = [];
  for (const row of rows) {
    for (let c = 0; c < SAIL_COLS; c += 1) {
      const s = c / (SAIL_COLS - 1);
      sheet.push(poleR + row.lx + (row.tx - row.lx) * s, row.ly + (row.ty - row.ly) * s, 0);
      cloth.push(s, row.t);
      /* The front sheet's triangles face -z and read the right half of
       * the print backwards; the reverse ones face +z and read the left
       * half straight. Swapped, the mark is mirrored on both sides. */
      uvFacingAway.push(1 - s * 0.5, row.t);
      uvFacingViewer.push(s * 0.5, row.t);
    }
  }
  const n = rows.length * SAIL_COLS;
  const front = [];
  const reverse = [];
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let c = 0; c + 1 < SAIL_COLS; c += 1) {
      const a = r * SAIL_COLS + c;
      const b = a + SAIL_COLS;
      front.push(a, b, a + 1, a + 1, b, b + 1);
      reverse.push(n + a + 1, n + b, n + a, n + b + 1, n + b, n + a + 1);
    }
  }
  /* Normals from the front sheet alone: over both, each pair of opposed
   * faces would cancel to nothing. */
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute(sheet, 3));
  shape.setIndex(front);
  shape.computeVertexNormals();
  const normals = shape.getAttribute('normal').array;
  const both = new Float32Array(n * 6);
  both.set(normals, 0);
  both.set(normals, n * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sheet.concat(sheet), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvFacingAway.concat(uvFacingViewer), 2));
  geo.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth.concat(cloth), 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(both, 3));
  geo.setIndex(front.concat(reverse));
  return geo;
}

/*
 * Pennants on the header. opts.flagSigns places each mast as a fraction of
 * the header's half width (-1 left, 1 right, 0 the middle, facing the
 * gate); opts.flagLeans says which way each one's sail and whip lean,
 * outboard by default, and a middle mast leans right. Each mast takes
 * two capsules, the straight pole and the whip. Sails stay live because
 * they wave.
 */
function addPennants(group, opts, headerTop, halfW) {
  const signs = opts.flagSigns;
  if (!signs || !signs.length) {
    return { top: 0, animate: [], caps: [] };
  }
  const h = Math.max(0.2, opts.flagH ?? 1.45);
  const poleR = Math.max(0.008, opts.flagPoleR ?? 0.012);
  const hitR = Math.max(0.05, poleR);
  const { bendY, tip } = flagMast(h);
  const sails = plainPrints().pennants;
  const rack = new THREE.Group();
  group.add(rack);
  const animate = [];
  const caps = [];
  signs.forEach((sign, i) => {
    const x = sign * halfW;
    const lean = (opts.flagLeans && opts.flagLeans[i]) || (sign < 0 ? -1 : 1);
    const pole = new THREE.Mesh(mastGeometry(poleR, h), gateLooks().tube);
    const sail = new THREE.Mesh(sailGeometry(poleR, h), sails[i % sails.length]);
    for (const part of [pole, sail]) {
      part.position.set(x, headerTop, 0);
      part.rotation.y = lean < 0 ? Math.PI : 0;
      part.castShadow = true;
      rack.add(part);
    }
    animate.push(sail);
    caps.push(capsule('obstacle', x, headerTop, 0, x, headerTop + bendY, 0, hitR));
    caps.push(capsule('obstacle', x, headerTop + bendY, 0, x + lean * tip.x, headerTop + tip.y, 0, hitR));
  });
  return { top: headerTop + h, animate, caps };
}

/* ------------------------------------------------------------------ */
/* The framed gate                                                     */
/* ------------------------------------------------------------------ */

const FOOT = { w: 0.34, h: 0.08, d: 0.62 };
const SLEEVE_W = 0.42;

/*
 * The frame's dimensions from a spec. Openings stack one tube apart, so
 * two neighbours share a cross member; a spec's own levelPitch (a track
 * document's) wins over that. The uprights' inner faces are the clear
 * width, and they run from the ground to just over the top member. A
 * cross member tops every opening, and one sits under the lowest only
 * when it is off the ground: a gate on grass has the grass as its sill.
 */
function frameLayout(spec) {
  const tubeR = (spec.tubeOD ?? BUILT_FRAME_TUBE_OD) * 0.5;
  const { clearW, clearH, sillH } = spec;
  const levels = spec.stack ?? 1;
  const pitch = spec.levelPitch ?? (clearH + BUILT_FRAME_TUBE_OD);
  const sills = [];
  for (let k = 0; k < levels; k += 1) {
    sills.push(sillH + k * pitch);
  }
  const openTop = sills[levels - 1] + clearH;
  const rails = sills.map((s) => s + clearH + tubeR);
  if (sillH > 0) {
    rails.push(sillH - tubeR);
  }
  return {
    kind: spec.frameKind ?? 'gate',
    tubeR,
    clearW,
    clearH,
    levels,
    sills,
    openTop,
    rails,
    railLen: clearW + 4 * tubeR,
    postX: clearW * 0.5 + tubeR,
    postH: openTop + 2 * tubeR,
  };
}

function framePiece(group, geometry, material, x, y, outlined) {
  const piece = new THREE.Mesh(geometry, material);
  piece.position.set(x, y, 0);
  piece.castShadow = true;
  if (outlined) {
    outlineHull(piece, 1.06);
  }
  group.add(piece);
  return piece;
}

/* Uprights on their feet, cross members, and a moulded corner wherever
 * an upright meets a member, which is what makes four tubes read as a
 * thing assembled from parts. */
function addFrame(group, caps, L) {
  const look = gateLooks();
  for (const side of [-1, 1]) {
    const x = side * L.postX;
    framePiece(group, new THREE.CylinderGeometry(L.tubeR, L.tubeR, L.postH, 8), look.tube, x, L.postH * 0.5, true);
    caps.push(capsule(L.kind, x, 0, 0, x, L.postH, 0, L.tubeR));
    /* MultiGP's weighted base, so the gate stands on the grass. */
    framePiece(group, new THREE.BoxGeometry(FOOT.w, FOOT.h, FOOT.d), look.tube, x, FOOT.h * 0.5, false);
    caps.push(capsule('obstacle', x, FOOT.h * 0.5, -FOOT.d * 0.5, x, FOOT.h * 0.5, FOOT.d * 0.5, FOOT.w * 0.5));
  }
  const half = L.railLen * 0.5;
  for (const y of L.rails) {
    const rail = framePiece(group, new THREE.CylinderGeometry(L.tubeR, L.tubeR, L.railLen, 8), look.tube, 0, y, true);
    rail.rotation.z = Math.PI * 0.5;
    caps.push(capsule(L.kind, -half, y, 0, half, y, 0, L.tubeR));
  }
  const s = L.tubeR * 2.9;
  for (const sill of L.sills) {
    for (const y of [sill - L.tubeR, sill + L.clearH + L.tubeR]) {
      for (const side of [-1, 1]) {
        framePiece(group, new THREE.BoxGeometry(s, s, s * 0.92), look.joint, side * L.postX, y, false);
      }
    }
  }
}

/*
 * Every opening as the race and the dressing read it, measured off the
 * frame as built: the clear width between the uprights' inner faces and
 * the clear height from the sill to the underside of the member above.
 */
function openingsOf(L) {
  const innerW = 2 * L.postX - 2 * L.tubeR;
  return L.sills.map((sill, k) => {
    const h = (L.rails[k] - L.tubeR) - sill;
    return { shape: 'square', index: k, sillH: sill, centreY: sill + h * 0.5, clearW: innerW, clearH: h };
  });
}

/*
 * One race gate at its built dimensions, for a caller that stands it in a
 * world itself: the in-sim builder (src/builder/), through
 * src/render/pylons.js builtGate. `spec` is src/builder/course.js
 * gateSpec's: clearW, clearH, sillH, and optionally stack, levelPitch,
 * tubeOD, frameKind and kindName. `index` is the number painted on the
 * header; `isStart` makes the lit target the start gate's colour;
 * opts.primary names the opening that carries the glow, and opts.flagSigns,
 * flagLeans, flagH and flagPoleR dress the header with pennants.
 *
 * Returns the group, the lit handles (live every frame, as are the
 * pennants' sails), one aperture per opening, the top of the header or of
 * a pennant, and the capsules, all in the group's frame. Nothing is added
 * to a world and nothing is baked.
 */
export function standaloneGate(spec, index, isStart, opts = {}) {
  if (!spec) {
    throw new Error('scene: obstacle called without a spec');
  }
  const { sleeve, sleeveMirrored } = plainPrints();
  const L = frameLayout(spec);
  const group = new THREE.Group();
  const caps = [];
  addFrame(group, caps, L);

  /* The sleeves, outboard of each upright and solid, so their capsules
   * stay out of the clear span. The far leg's print is painted mirrored,
   * so the chequer runs down the outside on both sides. */
  const bottom = L.sills[0];
  const tall = L.openTop - bottom;
  for (const side of [-1, 1]) {
    const cx = side * (L.postX + L.tubeR + SLEEVE_W * 0.5);
    const panel = printedSheet(SLEEVE_W, tall, 0.03, side < 0 ? sleeveMirrored : sleeve);
    panel.position.set(cx, bottom + tall * 0.5, 0);
    group.add(panel);
    caps.push(...sheetCaps(cx, bottom + tall * 0.5, tall * 0.5, SLEEVE_W * 0.5, true));
  }

  const board = headerBoard(index, 2 * (L.postX + L.tubeR + SLEEVE_W));
  const boardY = L.postH + GATE_BANNER_H * 0.5 + 0.03;
  board.position.set(0, boardY, 0);
  group.add(board);
  caps.push(...sheetCaps(0, boardY, board.userData.halfW, board.userData.r, false));

  const marks = apertureMarkers(group, L.sills, L.clearW, L.clearH, L.levels, isStart, opts.primary);
  const apertures = openingsOf(L);
  const headerTop = boardY + board.userData.r;
  const flags = addPennants(group, opts, headerTop, board.userData.halfW);
  caps.push(...flags.caps);

  return {
    group,
    kindName: spec.kindName ?? 'standardGate',
    top: Math.max(headerTop, flags.top),
    animate: [...marks.rings, ...marks.halos, marks.glow, marks.cue, ...flags.animate],
    ringMat: marks.ring.material,
    haloMat: marks.halo.material,
    ringMeshes: marks.rings,
    haloMeshes: marks.halos,
    glowMat: marks.glow.material,
    glowMesh: marks.glow,
    cueGroup: marks.cue,
    fillMat: marks.fillMat,
    ringColor: marks.ringColor,
    apertures,
    primary: marks.primary,
    aperture: apertures[marks.primary],
    colliders: caps,
  };
}

/* Frees what standaloneGate (or pylons.js builtGate) built, except the
 * shared materials and prints, which outlive any one gate. */
export function disposeStandaloneGate(made) {
  const lasting = new Set(Object.values(gateLooks()));
  if (prints) {
    for (const m of [prints.header, prints.sleeve, prints.sleeveMirrored, ...prints.pennants]) {
      lasting.add(m);
    }
  }
  made.group.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    for (const m of [o.material].flat()) {
      if (m && !lasting.has(m)) {
        m.dispose();
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Dressing                                                            */
/* ------------------------------------------------------------------ */

function tintGlow(mat, front, back) {
  mat.uniforms.uFront.value.set(front);
  mat.uniforms.uBack.value.set(back);
}

/*
 * A gate's markings for one tier: 'target', 'follow' or 'dark'. `gt` is the
 * shape src/builder/buildmode.js makes of a built gate (its handles plus
 * litApertures, glowGain, trackGlow, aperture and virtual). A dark ring is
 * hidden rather than painted near black, since an opaque dark bar across
 * the hole is not an absent one; on a stack only the openings in
 * litApertures light.
 */
export function dressGate(gt, tier) {
  const lit = tier !== 'dark';
  const target = tier === 'target';
  gt.ringMat.visible = lit;
  gt.haloMat.visible = target;
  gt.glowMat.visible = target;
  (gt.ringMeshes || []).forEach((ring, k) => {
    const on = lit && gt.litApertures.includes(k);
    ring.visible = on;
    const halo = gt.haloMeshes && gt.haloMeshes[k];
    if (halo) {
      halo.visible = on && target;
    }
  });
  gt.ringMat.color.set(gt.ringColor);
  if (tier === 'follow') {
    gt.ringMat.color.multiplyScalar(FOLLOW_DIM);
  }
  gt.haloMat.color.set(gt.ringColor);
  gt.haloMat.opacity = 0.34;
  tintGlow(gt.glowMat, gt.ringColor, gt.ringColor);
  gt.glowMat.uniforms.uGain.value = 0.08 * (gt.glowGain ?? 1);
  if (gt.cueGroup) {
    gt.cueGroup.visible = Boolean(gt.virtual) && lit;
  }
  if (gt.fillMat) {
    gt.fillMat.uniforms.uWrong.value = 0;
    gt.fillMat.uniforms.uOpacity.value = target ? 0.22 : 0.10;
  }
}

/*
 * The gate the race wants next. The glow is lit from both faces, green
 * and red, until colourTargetSide picks a side; at 0.55 its edge still
 * reads without washing out the gate's own dress. A stack's one glow and
 * pane move to the opening this station names.
 */
export function lightTarget(target) {
  dressGate(target, 'target');
  target.ringMat.color.set(ON_LINE);
  target.haloMat.color.set(ON_LINE);
  tintGlow(target.glowMat, ON_LINE, OFF_LINE);
  target.glowMat.uniforms.uGain.value = 0.55 * (target.glowGain ?? 1);
  if (target.trackGlow && target.aperture) {
    for (const part of [target.glowMesh, target.cueGroup]) {
      if (part) {
        part.position.y = target.aperture.centreY;
      }
    }
  }
  if (target.cueGroup) {
    target.cueGroup.visible = true;
  }
}

/* Green when the camera is on the side the target is flown from, red with
 * the cross from the other. Both faces of the glow and pane take it,
 * because the side is the camera's, not the fragment's: a pane seen edge
 * on would otherwise flicker between the two. */
export function colourTargetSide(target, correct) {
  const colour = correct ? ON_LINE : OFF_LINE;
  target.ringMat.color.set(colour);
  target.haloMat.color.set(colour);
  tintGlow(target.glowMat, colour, colour);
  if (target.fillMat) {
    tintGlow(target.fillMat, colour, colour);
    target.fillMat.uniforms.uWrong.value = correct ? 0 : 1;
  }
}

/* ------------------------------------------------------------------ */
/* Sky                                                                 */
/* ------------------------------------------------------------------ */

/*
 * The cel sky: a horizon to zenith gradient posterised into nine bands,
 * mixed half back to smooth so a band edge never reads as one hard arc
 * across the frame, then a warm glow round the sun and its disc. The
 * height gain lifts the bands off the horizon. The direction is
 * renormalised per fragment because the sun's disc is a threshold on it,
 * and an interpolated unit vector is short inside a face. The disc mixes
 * to a ceiling below white with a soft ramp (1.0 to 1.6 degrees) so it
 * neither clips nor stairs. The zenith is pale on purpose: sky and lit
 * grass must sit in different value bands, and blue carries little
 * luminance.
 */
const SKY_ZENITH = 0x6ea3d8;
const SKY_HORIZON = 0xf2e3cb;
const SUN_DIRECTION = new THREE.Vector3(0.60, 0.50, 0.62).normalize();

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uHigh;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float altitude = clamp(dir.y * 1.25 + 0.06, 0.0, 1.0);
    float bands = altitude * 9.0;
    float poster = (floor(bands) + smoothstep(0.35, 0.95, fract(bands))) / 9.0;
    vec3 sky = mix(uHorizon, uHigh, mix(altitude, poster, 0.5));
    float toSun = max(dot(dir, normalize(uSun)), 0.0);
    sky += vec3(1.0, 0.80, 0.42) * pow(toSun, 40.0) * 0.30;
    sky = mix(sky, vec3(0.985, 0.965, 0.905), smoothstep(0.99961, 0.99985, toSun));
    gl_FragColor = vec4(sky, 1.0);
  }
`;

/*
 * The sky as a dome round the camera. It is recentred on the rendering
 * camera before every draw and drawn first with no depth test, so a world
 * wider than its 1500 m radius (the Alps) never flies out of it and it is
 * never in front of a far ridge.
 */
export function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(SKY_ZENITH) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSun: { value: SUN_DIRECTION.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SKY_FRAGMENT,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 40, 24), mat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.onBeforeRender = (renderer, scene, camera) => {
    dome.position.setFromMatrixPosition(camera.matrixWorld);
    dome.updateMatrixWorld();
  };
  return dome;
}
