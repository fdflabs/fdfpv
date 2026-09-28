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
  apertureMarkers, GATE_COLOUR, gateCue, openingBadge, standaloneGate, START_COLOUR,
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
 * THE PAIR: two cones with spec.clearW of air between their bases, and
 * that opening from the ground to their tips, lit the way a gate's is
 * (scene.js apertureMarkers): the window the race scores. Its uprights
 * stand on the bases' edges and rise clear of the fabric as the cones
 * narrow away from them.
 */
function pylonPair(spec, index, isStart) {
  const g = new THREE.Group();
  const caps = [];
  for (const sx of [-1, 1]) {
    cone(g, spec, sx * (spec.clearW * 0.5 + spec.baseRadius), index + 1, caps);
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
 * A SKY HOOP: a torus that floats, the ring race hoop (src/trackbuilder/
 * elements.js has the sizes and why). Built in the gate frame, x across,
 * y up from the base, z through, with the base at the bottom of the rim,
 * so it stands on its rim when it is set down and its centre is one outer
 * radius up.
 *
 * WHAT MAKES IT READ FROM FAR OFF, in the Alps sky, where a gate's square
 * banner has a mountainside behind it and a hoop has only air:
 *   the rim, signal red with white bands, a colour nothing in either valley
 *     is, the bands so its round shape reads before its colour does;
 *   the lit shell over the rim (ringMat, the field's ring tier) and on the
 *     gate the race wants next a halo round it and a soft disc of light
 *     across the opening that pulses, gently, so the next hoop is the one
 *     thing in the sky that moves;
 *   a marker light on top, unfogged, and a sprite over it that is the same
 *     size on the screen at any distance, so the light is a red point at a
 *     kilometre, where the rim's tube is under a pixel;
 *   the rim's centreline drawn as a line too, unfogged: a line is never
 *     thinner than a pixel, so far off the hoop is still a crisp circle;
 *   a faint line straight down to the ground and a ring where it lands, so
 *     how high it hangs reads from any distance (setGround, which the
 *     builder calls wherever it puts one).
 * The rim's tube grows with the hoop (a fifteenth of it on a plane hoop),
 * so a 30 m hoop is a 2 m tube, not a thread.
 *
 * THE COLLIDER is the rim's centreline as RIM_SEGMENTS capsules of the
 * tube's radius: their chords sag inside the true circle by R (1 - cos(pi
 * / n)), 0.14 m on the 30 m hoop against its 1 m tube. Their kind is the
 * spec's: 'hoop' for a plane hoop, the soft rim src/game/jelly.js answers
 * for a plane, 'gate' for a quad hoop's firm thin tube.
 */
const RIM_SEGMENTS = 24;
const RIM = 0xff3d1f;
const RIM_BAND = 0xf4f1ea;
const RIM_BANDS = 8;
const MARKER = 0xff2a2a;
/* The far light's size on the screen, a share of the view's height. */
const BEACON = 0.014;
/* The pulse on the target's disc: its period, s, and how deep it is. */
const PULSE_S = 0.8;
const PULSE_DEPTH = 0.3;

function rimGeometry(Rc, t) {
  const geo = new THREE.TorusGeometry(Rc, t, 12, 96);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const body = new THREE.Color(RIM);
  const band = new THREE.Color(RIM_BAND);
  for (let i = 0; i < pos.count; i += 1) {
    /* Which of 2 RIM_BANDS arcs round the hoop this vertex is on: every
     * other one white, a narrow one. */
    const a = Math.atan2(pos.getY(i), pos.getX(i)) / (2 * Math.PI) + 0.5;
    const k = a * RIM_BANDS * 2;
    const c = k - Math.floor(k) < 0.28 && Math.floor(k) % 2 === 0 ? band : body;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* The far light's picture, a soft red dot, drawn once for every hoop. */
let beaconTex = null;
function beaconTexture() {
  if (beaconTex) {
    return beaconTex;
  }
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 235, 225, 1)');
  grad.addColorStop(0.35, 'rgba(255, 60, 40, 1)');
  grad.addColorStop(1, 'rgba(255, 40, 30, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  beaconTex = new THREE.CanvasTexture(c);
  beaconTex.colorSpace = THREE.SRGBColorSpace;
  return beaconTex;
}

function hoop(spec, index, isStart) {
  const g = new THREE.Group();
  const D = spec.diameter;
  const t = spec.tubeR;
  const Rc = D / 2 + t;
  const cy = 2 * t + D / 2;
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;

  const mat = celMaterial({ color: 0xffffff, rim: 0.3 });
  mat.vertexColors = true;
  const rim = new THREE.Mesh(rimGeometry(Rc, t), mat);
  rim.position.y = cy;
  rim.castShadow = true;
  g.add(rim);

  const additive = (opacity) => new THREE.MeshBasicMaterial({
    color: ringColor, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const ringMat = additive(0.3);
  const haloMat = additive(0.22);
  const shell = new THREE.Mesh(new THREE.TorusGeometry(Rc, t * 1.08, 8, 96), ringMat);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(Rc, t * 1.8 + D * 0.01, 8, 96), haloMat);
  for (const m of [shell, halo]) {
    m.position.y = cy;
    m.layers.set(1);
    g.add(m);
  }

  const uniforms = {
    uFront: { value: new THREE.Color(ringColor) },
    uBack: { value: new THREE.Color(ringColor) },
    uGain: { value: 0.1 },
    uEdge: { value: (D / 2) / (D * 1.3) },
    uTime: { value: 0 },
  };
  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uFront;
      uniform float uGain;
      uniform float uEdge;
      uniform float uTime;
      void main() {
        /* A round band on the rim and a soft wash across the disc, the
         * square gate's glow (scene.js apertureMarkers) made round, with
         * a slow breath on it. */
        float r = length(vUv - 0.5);
        float band = exp(-pow((r - uEdge) / 0.05, 2.0));
        float fill = smoothstep(uEdge, 0.0, r) * 0.2;
        float pulse = 1.0 - ${PULSE_DEPTH.toFixed(2)} * (0.5 + 0.5 * sin(uTime * ${(2 * Math.PI / PULSE_S).toFixed(4)}));
        gl_FragColor = vec4(uFront * (band + fill) * uGain * pulse, 1.0);
      }
    `,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(D * 1.3, D * 1.3), glowMat);
  glow.position.y = cy;
  glow.layers.set(1);
  glow.onBeforeRender = () => {
    uniforms.uTime.value = performance.now() / 1000;
  };
  g.add(glow);
  const cue = gateCue(D, D, true);
  cue.position.y = cy;
  g.add(cue);

  /* The marker light, and a halo round it that keeps it a point far off. */
  const lightR = Math.max(0.05, t * 0.7);
  const lightY = cy + Rc + t + lightR * 0.6;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(lightR, 12, 8), new THREE.MeshBasicMaterial({ color: MARKER, fog: false }));
  const glare = new THREE.Mesh(new THREE.SphereGeometry(lightR * 3, 12, 8), new THREE.MeshBasicMaterial({
    color: MARKER, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  for (const m of [bulb, glare]) {
    m.position.y = lightY;
    m.layers.set(1);
    g.add(m);
  }
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: beaconTexture(), sizeAttenuation: false, depthWrite: false, transparent: true, fog: false,
  }));
  beacon.scale.set(BEACON, BEACON, 1);
  /* A sprite asks the raycaster for its camera, and the builder's hover
   * ray has none: the rim is what is aimed at, not the light. */
  beacon.raycast = () => {};
  beacon.position.y = lightY;
  beacon.layers.set(1);
  g.add(beacon);
  const loopPts = [];
  for (let k = 0; k < 96; k += 1) {
    const u = (2 * Math.PI * k) / 96;
    loopPts.push(new THREE.Vector3(Rc * Math.cos(u), cy + Rc * Math.sin(u), 0));
  }
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loopPts), new THREE.LineBasicMaterial({
    color: RIM, fog: false, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  outline.layers.set(1);
  g.add(outline);

  /* The number, both faces, on the rim under the light. */
  const scale = Math.max(1, t * 8);
  for (const sz of [-1, 1]) {
    const badge = openingBadge(index + 1, scale);
    badge.position.set(0, cy + Rc, sz * (t * 1.1 + 0.03 * scale));
    g.add(badge);
  }

  /* The drop line and the ring where it lands, in the world's vertical
   * whatever the hoop's turn: laid out by setGround. */
  const dropMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
  });
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const drop = new THREE.Line(dropGeo, dropMat);
  drop.layers.set(1);
  drop.frustumCulled = false;
  g.add(drop);
  const footR = Math.max(0.3, D * 0.15);
  const foot = new THREE.Mesh(new THREE.RingGeometry(footR * 0.8, footR, 48), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
  }));
  foot.layers.set(1);
  foot.visible = false;
  g.add(foot);
  const wp = new THREE.Vector3();
  const lp = new THREE.Vector3();
  const qInv = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  /* heightAt(x, z) is the map's ground. */
  const setGround = (heightAt) => {
    g.updateMatrixWorld(true);
    /* Straight down from under the rim's lowest point to the ground below
     * the hoop's centre. */
    wp.set(0, cy, 0);
    g.localToWorld(wp);
    const groundY = heightAt(wp.x, wp.z);
    /* The rim's lowest point whatever the turn: the circle's plane is the
     * group's x and y, and its drop below the centre is Rc times the
     * length of their vertical parts. */
    g.getWorldQuaternion(qInv);
    lp.set(1, 0, 0).applyQuaternion(qInv);
    const ux = lp.y;
    lp.set(0, 1, 0).applyQuaternion(qInv);
    const low = wp.y - Rc * Math.hypot(ux, lp.y) - t;
    const arr = dropGeo.attributes.position.array;
    lp.set(wp.x, low, wp.z);
    g.worldToLocal(lp);
    arr[0] = lp.x;
    arr[1] = lp.y;
    arr[2] = lp.z;
    lp.set(wp.x, groundY, wp.z);
    g.worldToLocal(lp);
    arr[3] = lp.x;
    arr[4] = lp.y;
    arr[5] = lp.z;
    dropGeo.attributes.position.needsUpdate = true;
    const above = low - groundY > 0.5;
    drop.visible = above;
    foot.visible = above;
    foot.position.copy(lp);
    g.getWorldQuaternion(qInv).invert();
    foot.quaternion.copy(qInv).multiply(flat);
  };

  const caps = [];
  for (let k = 0; k < RIM_SEGMENTS; k += 1) {
    const a0 = (2 * Math.PI * k) / RIM_SEGMENTS;
    const a1 = (2 * Math.PI * (k + 1)) / RIM_SEGMENTS;
    caps.push({
      kind: spec.rimKind,
      ax: Rc * Math.cos(a0), ay: cy + Rc * Math.sin(a0), az: 0,
      bx: Rc * Math.cos(a1), by: cy + Rc * Math.sin(a1), bz: 0,
      r: t,
    });
  }
  const aperture = {
    shape: 'round', index: 0, sillH: 2 * t, centreY: cy, clearW: D, clearH: D,
  };
  return {
    group: g,
    kindName: spec.kindName,
    top: lightY + lightR * 3,
    animate: [shell, halo, glow, cue],
    ringMat,
    haloMat,
    ringMeshes: [shell],
    haloMeshes: [halo],
    glowMat,
    glowMesh: glow,
    cueGroup: cue,
    fillMat: cue.userData.fillMat,
    ringColor,
    apertures: [aperture],
    primary: 0,
    aperture,
    colliders: caps,
    setGround,
    /* The parts that are there to be seen from far off, which a ghost and
     * an icon leave out (src/builder/buildmode.js lightParts). */
    beacons: [beacon, outline],
    /* Where a whack wobbles it about (src/builder/buildmode.js): its
     * centre, since it hangs in the air. */
    pivotY: cy,
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
  if (spec.kindName === 'hoop') {
    return hoop(spec, index, isStart);
  }
  return standaloneGate(spec, index, isStart, opts);
}
