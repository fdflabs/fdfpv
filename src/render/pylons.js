/*
 * pylons.js: the air race pylon, drawn, and the one call the in-sim builder
 * makes for any gate it places.
 *
 * A pylon is an inflatable cone (src/trackbuilder/elements.js has its size
 * and where the size comes from). It is built the way scene.js builds a
 * gate: a group in its own frame, x across, y up from the base, z through,
 * with the lit parts dressGate, lightTarget and colourTargetSide drive and
 * the capsules the craft meets, handed back and never added to a world.
 *
 * THE COLLIDER IS FOUR CAPSULES UP THE CONE, each the cone's radius at its
 * own middle height, so the craft meets a cone that is at most an eighth of
 * the taper off anywhere, 0.08 m at the base. They are the 'pylon' kind,
 * which src/game/crashworld.js gives as an inflated tube; the plant takes
 * each as a post of its own (sim_obstacle_compliance), so a clip high on
 * the cone folds the top of it and not the whole thing.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { celMaterial, outlineHull } from './celmat.js';
import {
  apertureMarkers, GATE_COLOUR, openingBadge, standaloneGate, START_COLOUR,
} from './scene.js';

/* Capsules up one cone. */
export const PYLON_SEGMENTS = 4;

/*
 * The fabric's colours. The air race flew its level gates between blue
 * pylons, and F3D asks for pylons "finished in a bright colour in order to
 * enhance visibility" (FAI Sporting Code, Volume F3, 5.2.16 e): the pair is
 * the air race's blue, the one turned round is a signal orange, so a pilot
 * reads which job a cone has before reading its number. Each has a white
 * band under the tip, and a darker skirt where the blower feeds it.
 */
const FABRIC = { pylonPair: 0x2a63d4, pylon: 0xff6a1a };
const BAND = 0xf4f1ea;
const SKIRT = 0x2b2f38;

/* The cone's radius at height y, as drawn and as collided. */
function coneR(spec, y) {
  const t = Math.max(0, Math.min(1, y / spec.height));
  return spec.baseRadius + (spec.tipRadius - spec.baseRadius) * t;
}

/*
 * The inflated profile: the cone, a little fuller at mid height the way a
 * blown fabric panel is, closed with a dome over the tip. Centred on its
 * middle height so an outline hull scales about the middle of it.
 */
function coneProfile(spec, grow = 1) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i += 1) {
    const y = (spec.height * i) / n;
    const full = 1 + 0.05 * Math.sin((Math.PI * i) / n);
    pts.push(new THREE.Vector2(coneR(spec, y) * full * grow, y - spec.height / 2));
  }
  const tip = spec.tipRadius * grow;
  for (let i = 1; i <= 6; i += 1) {
    const a = (Math.PI / 2) * (i / 6);
    pts.push(new THREE.Vector2(Math.max(1e-3, tip * Math.cos(a)), spec.height / 2 + tip * Math.sin(a)));
  }
  return pts;
}

function fabricGeometry(spec) {
  const geo = new THREE.LatheGeometry(coneProfile(spec), 32);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const body = new THREE.Color(FABRIC[spec.kindName]);
  const band = new THREE.Color(BAND);
  const skirt = new THREE.Color(SKIRT);
  for (let i = 0; i < pos.count; i += 1) {
    const u = (pos.getY(i) + spec.height / 2) / spec.height;
    const c = u < 0.05 ? skirt : (u > 0.74 && u < 0.86 ? band : body);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* One cone at x across its own frame, with its capsules. */
function cone(g, spec, x, n, caps) {
  const mat = celMaterial({ color: 0xffffff, rim: 0.24 });
  mat.vertexColors = true;
  const body = new THREE.Mesh(fabricGeometry(spec), mat);
  body.position.set(x, spec.height / 2, 0);
  body.castShadow = true;
  outlineHull(body, 1.015);
  g.add(body);
  /* The number, both faces, at two thirds of its height. */
  const y = spec.height * 0.62;
  const scale = coneR(spec, y) * 2.2;
  for (const sz of [-1, 1]) {
    const badge = openingBadge(n, scale);
    badge.position.set(x, y, sz * (coneR(spec, y) * 1.06 + 0.02 * scale));
    g.add(badge);
  }
  const step = spec.height / PYLON_SEGMENTS;
  for (let k = 0; k < PYLON_SEGMENTS; k += 1) {
    caps.push({
      kind: 'pylon', ax: x, ay: k * step, az: 0, bx: x, by: (k + 1) * step, bz: 0, r: coneR(spec, (k + 0.5) * step),
    });
  }
  return body;
}

/*
 * THE PAIR: two cones spec.clearW apart on their axes, and the opening
 * between them from the ground to their tips, lit the way a gate's is
 * (scene.js apertureMarkers). The lit outline's uprights run up the
 * pylons' own axes, inside the fabric, so what shows is the line along the
 * ground and the one between the tips: the window the race scores.
 */
function pylonPair(spec, index, isStart) {
  const g = new THREE.Group();
  const caps = [];
  for (const sx of [-1, 1]) {
    cone(g, spec, sx * spec.clearW * 0.5, index + 1, caps);
  }
  const clearH = spec.height;
  const marks = apertureMarkers(g, [0], spec.clearW, clearH, 1, isStart, 0);
  const aperture = {
    shape: 'square', index: 0, sillH: 0, centreY: clearH / 2, clearW: spec.clearW, clearH,
  };
  return {
    group: g,
    kindName: spec.kindName,
    top: spec.height + spec.tipRadius,
    animate: [...marks.rings, ...marks.halos, marks.glow, marks.cue],
    ringMat: marks.ring.material,
    haloMat: marks.halo.material,
    ringMeshes: marks.rings,
    haloMeshes: marks.halos,
    glowMat: marks.glow.material,
    glowMesh: marks.glow,
    cueGroup: marks.cue,
    fillMat: marks.fillMat,
    ringColor: marks.ringColor,
    apertures: [aperture],
    primary: 0,
    aperture,
    colliders: caps,
  };
}

/*
 * THE SINGLE PYLON lights itself, as the field's flags and poles do
 * (scene.js virtualGate): the square it scores through is not drawn. What
 * is drawn is which side it is turned round on, a chevron on the ground on
 * that side pointing the way through, faint while building and lit with the
 * target, green from the side it is flown from and red from the other.
 * spec.passSign is +1 for a pass on the pilot's left, which is the frame's
 * -x (the race's `across` is R(-x)).
 */
function pylon(spec, index, isStart) {
  const g = new THREE.Group();
  const caps = [];
  cone(g, spec, 0, index + 1, caps);
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;
  const additive = (opacity) => new THREE.MeshBasicMaterial({
    color: ringColor, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const ringMat = additive(0.45);
  const haloMat = additive(0.22);
  const core = new THREE.Mesh(new THREE.LatheGeometry(coneProfile(spec, 1.04), 24), ringMat);
  const halo = new THREE.Mesh(new THREE.LatheGeometry(coneProfile(spec, 1.18), 24), haloMat);
  for (const m of [core, halo]) {
    m.position.y = spec.height / 2;
    m.layers.set(1);
    g.add(m);
  }
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
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFront;
      uniform float uGain;
      void main() {
        gl_FragColor = vec4(uFront * (0.3 + uGain), 1.0);
      }
    `,
  });
  /* A chevron 2.7 m long pointing along -z, flat on the ground on the pass
   * side, where the racing line rounds it: the clearance off its axis. */
  const s = new THREE.Shape();
  s.moveTo(0, 1.5);
  s.lineTo(1.2, -1.2);
  s.lineTo(0, -0.4);
  s.lineTo(-1.2, -1.2);
  s.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(s), glowMat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(-spec.passSign * spec.clearance, 0.06, 0);
  arrow.layers.set(1);
  g.add(arrow);
  return {
    group: g,
    kindName: spec.kindName,
    top: spec.height + spec.tipRadius,
    animate: [core, halo, arrow],
    ringMat,
    haloMat,
    ringMeshes: [core],
    haloMeshes: [halo],
    glowMat,
    glowMesh: arrow,
    cueGroup: null,
    fillMat: null,
    ringColor,
    apertures: [spec.scoring],
    primary: 0,
    aperture: spec.scoring,
    colliders: caps,
  };
}

/*
 * Any gate the builder places, from its spec (src/builder/course.js
 * gateSpec): a pylon here, a framed gate by scene.js standaloneGate.
 * scene.js disposeStandaloneGate frees either: everything a pylon owns is
 * its own but the badge's shared materials, which it keeps.
 */
export function builtGate(spec, index, isStart, opts = {}) {
  if (spec.kindName === 'pylonPair') {
    return pylonPair(spec, index, isStart);
  }
  if (spec.kindName === 'pylon') {
    return pylon(spec, index, isStart);
  }
  return standaloneGate(spec, index, isStart, opts);
}
