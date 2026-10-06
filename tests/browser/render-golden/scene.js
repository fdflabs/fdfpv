/*
 * render-golden/scene.js: src/render/scene.js and the gates
 * src/render/pylons.js builds on it. Every gate the in-sim builder places
 * (each framed kind, flagged on every side, stacks lit at a named level,
 * the wide banner gates, the pylon, the pylon pair and the sky hoops) as a
 * scene graph with its handles, colliders and apertures; which materials
 * every gate shares; what disposeStandaloneGate frees; the aperture
 * markers, the cue and the number badge on their own; the sky dome; the
 * state dressGate, lightTarget and colourTargetSide leave; a hoop hung
 * over the ground; and pictures on SwiftShader of gates lit, wrong side,
 * dimmed and dark, the cue from both faces, pennants waving, the hoop's
 * pulse, the pylons, and the sky toward and away from the sun.
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
import * as sceneModule from '../../../src/render/scene.js';
import * as pylonsModule from '../../../src/render/pylons.js';
import { updateCelTime, CLOTH_CHUNK } from '../../../src/render/celmat.js';
import { describeObject, makeTable, picture, canvas2d } from '../render-golden-lib.js';

const {
  standaloneGate, disposeStandaloneGate, apertureMarkers, gateCue, openingBadge, skyDome,
  dressGate, lightTarget, colourTargetSide, GATE_COLOUR, START_COLOUR,
} = sceneModule;
const { builtGate } = pylonsModule;

let renderer = null;

/*
 * The specs src/builder/course.js gateSpec hands builtGate for the default
 * element of every kind it builds (field class, and the wing class where
 * it differs), written out so a change in the builder's tables cannot move
 * this module's golden.
 */
const PITCH = 1.7910111499999999;
const SPECS = {
  gate: { kindName: 'gate', clearW: 1.7526, clearH: 1.7526, sillH: 0, stack: 1, levelPitch: PITCH },
  wingGate: { kindName: 'gate', clearW: 5.75, clearH: 5.75, sillH: 0, stack: 1, levelPitch: 5.788411149999999 },
  flaggedGate: { kindName: 'flaggedGate', clearW: 1.7526, clearH: 1.7526, sillH: 0, stack: 1, levelPitch: PITCH },
  doubleStack: { kindName: 'doubleStack', clearW: 1.7526, clearH: 1.7526, sillH: 0, stack: 2, levelPitch: PITCH },
  flaggedDoubleStack: { kindName: 'flaggedDoubleStack', clearW: 1.7526, clearH: 1.7526, sillH: 0, stack: 2, levelPitch: PITCH },
  ladder: { kindName: 'ladder', clearW: 1.7526, clearH: 1.7526, sillH: 0, stack: 3, levelPitch: PITCH },
  tower: { kindName: 'tower', clearW: 1.7526, clearH: 1.7526, sillH: 1.7526, stack: 2, levelPitch: PITCH },
  diveGate: { kindName: 'diveGate', clearW: 2.4536399999999996, clearH: 2.10312, sillH: 5.2578, stack: 1, levelPitch: 2.14153115 },
  wideGate3: { kindName: 'wideGate3', clearW: 3, clearH: 3, sillH: 0, stack: 1, levelPitch: 3.033401, tubeOD: 0.048260000000000004, frameKind: 'banner' },
  wideGate5: { kindName: 'wideGate5', clearW: 5, clearH: 5, sillH: 0, stack: 1, levelPitch: 5.033401, tubeOD: 0.048260000000000004, frameKind: 'banner' },
  /* A spec a caller trims: no kind, no stack, no pitch. */
  bare: { clearW: 1.2, clearH: 0.9, sillH: 0.4 },
  pylonPair: { kindName: 'pylonPair', clearW: 45, height: 25, baseRadius: 2.5, tipRadius: 0.375 },
  pylonLeft: {
    kindName: 'pylon', height: 25, baseRadius: 2.5, tipRadius: 0.375, clearance: 15, passSign: 1,
    scoring: { shape: 'square', index: 0, sillH: 0, centreY: 17.5, clearW: 35, clearH: 35 },
  },
  pylonRight: {
    kindName: 'pylon', height: 25, baseRadius: 2.5, tipRadius: 0.375, clearance: 15, passSign: -1,
    scoring: { shape: 'square', index: 0, sillH: 0, centreY: 17.5, clearW: 35, clearH: 35 },
  },
  hoop175: { kindName: 'hoop', diameter: 1.75, tubeR: 0.025, rimKind: 'gate' },
  hoop6: { kindName: 'hoop', diameter: 6, tubeR: 0.25, rimKind: 'hoop' },
  hoop30: { kindName: 'hoop', diameter: 30, tubeR: 1, rimKind: 'hoop' },
};

/* gateFlags for a flagged element on each side it offers (field class),
 * and the wing class's taller mast. */
const flags = (signs, flagH = 1.6674999999999998) => ({
  flagSigns: signs, flagLeans: signs.map((s) => (s < 0 ? -1 : 1)), flagH, flagPoleR: 0.0138,
});
const FLAGS = {
  left: flags([-1]),
  right: flags([1]),
  both: flags([-1, 1]),
  top: flags([0]),
  wing: flags([-1], 3.4499999999999997),
};

/* Each built gate pinned: spec, index, start, options. */
const GATES = {
  gate: ['gate', 0, false, {}],
  gateStart: ['gate', 0, true, {}],
  gateTwoDigits: ['gate', 13, false, {}],
  gateThreeDigits: ['gate', 105, false, {}],
  gateFractional: ['gate', 12.4, false, {}],
  gateNegative: ['gate', -3, false, {}],
  wingGate: ['wingGate', 7, false, {}],
  flaggedLeft: ['flaggedGate', 2, false, FLAGS.left],
  flaggedRight: ['flaggedGate', 3, false, FLAGS.right],
  flaggedBoth: ['flaggedGate', 4, true, FLAGS.both],
  flaggedTop: ['flaggedGate', 5, false, FLAGS.top],
  flaggedWing: ['flaggedGate', 6, false, FLAGS.wing],
  flaggedNoLeans: ['flaggedGate', 6, false, { flagSigns: [-1, 0, 1] }],
  flaggedTinyMast: ['flaggedGate', 6, false, { flagSigns: [1], flagH: 0.05, flagPoleR: 0.001 }],
  doubleStack: ['doubleStack', 8, false, {}],
  flaggedDoubleStack: ['flaggedDoubleStack', 9, false, FLAGS.left],
  ladder: ['ladder', 10, false, {}],
  ladderBottom: ['ladder', 10, false, { primary: 0 }],
  ladderTop: ['ladder', 10, false, { primary: 2 }],
  ladderAbove: ['ladder', 10, false, { primary: 7 }],
  ladderBelow: ['ladder', 10, false, { primary: -1 }],
  ladderRounded: ['ladder', 10, false, { primary: 1.6 }],
  tower: ['tower', 11, false, {}],
  diveGate: ['diveGate', 12, true, {}],
  wideGate3: ['wideGate3', 1, false, {}],
  wideGate5: ['wideGate5', 1, false, {}],
  bare: ['bare', 1, false, {}],
  pylonPair: ['pylonPair', 0, false, {}],
  pylonPairStart: ['pylonPair', 4, true, {}],
  pylonLeft: ['pylonLeft', 1, false, {}],
  pylonRight: ['pylonRight', 9, true, {}],
  hoop175: ['hoop175', 0, false, {}],
  hoop6: ['hoop6', 2, true, {}],
  hoop30: ['hoop30', 14, false, {}],
};

const build = (name) => {
  const [spec, index, isStart, opts] = GATES[name];
  return builtGate(SPECS[spec], index, isStart, opts);
};

/* Numbers to the twelve significant digits the lib rounds transforms to,
 * so an ulp of arithmetic is not a failure; structure stays exact. */
function rounded(v) {
  if (typeof v === 'number') {
    return Number(v.toPrecision(12));
  }
  if (Array.isArray(v)) {
    return v.map(rounded);
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)]));
  }
  return v;
}

/*
 * A described graph without the shader source hashes. The lib hashes the
 * GLSL text, comments and all, so a rewrite of a shader's prose would fail
 * a golden its pixels pass. What a shader draws is pinned by the pictures
 * below, every shader in this module being in at least one of them.
 */
/*
 * Also, a geometry equal to one described before it in the same case (a
 * gate's dozens of identical number pips) is written as the ref it
 * repeats, which keeps that it is a geometry of its own and keeps the
 * golden a readable size.
 */
/*
 * A cel material's program cache key carries celmat.js's cloth shader text
 * (the key is the injected source itself, so it cannot disagree with the
 * shader). That text is celmat's to change, and celmat's own golden pins
 * what it draws; here it stands as a name, found by celmat's own export,
 * so this golden still tells a cloth program from a plain one and from any
 * other key without pinning another module's source.
 */
function programKey(key) {
  return typeof key === 'string' ? key.split(CLOTH_CHUNK).join('<celmat CLOTH_CHUNK>') : key;
}

function scrub(v, seen = new Map()) {
  if (Array.isArray(v)) {
    return v.map((x) => scrub(x, seen));
  }
  if (!v || typeof v !== 'object') {
    return v;
  }
  if (typeof v.ref === 'string' && v.ref.startsWith('g') && v.attrs) {
    const { ref, ...content } = v;
    const key = JSON.stringify(content);
    if (seen.has(key)) {
      return { ref, as: seen.get(key) };
    }
    seen.set(key, ref);
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if ((k === 'vertexShader' || k === 'fragmentShader') && v.type === 'ShaderMaterial') {
      continue;
    }
    out[k] = k === 'cacheKey' ? programKey(x) : scrub(x, seen);
  }
  return out;
}

/* Each node of a graph by its child index path from the root ('' is the
 * root, '3.1' the second child of the fourth). */
function pathsOf(root) {
  const paths = new Map();
  const walk = (o, p) => {
    paths.set(o, p);
    o.children.forEach((c, i) => walk(c, p === '' ? `${i}` : `${p}.${i}`));
  };
  walk(root, '');
  return paths;
}

/* A built gate's handles: objects as their path in its group, materials
 * as the table's ref, functions as their name, data rounded. */
function handles(made, table) {
  const paths = pathsOf(made.group);
  const one = (v) => {
    if (v === null || v === undefined) {
      return v ?? null;
    }
    if (v.isObject3D) {
      return paths.has(v) ? `node ${paths.get(v)}` : 'node outside the group';
    }
    if (v.isMaterial) {
      return `material ${table(v, 'm')[0]}`;
    }
    if (typeof v === 'function') {
      return 'function';
    }
    if (Array.isArray(v)) {
      return v.map(one);
    }
    if (typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, one(x)]));
    }
    return rounded(v);
  };
  return Object.fromEntries(Object.keys(made).filter((k) => k !== 'group').sort().map((k) => [k, one(made[k])]));
}

/* Every material's scenery bucket and the parts the graph does not say:
 * a cue's fill handle, a raycast turned off. */
function extras(made, table) {
  const out = [];
  const paths = pathsOf(made.group);
  made.group.traverse((o) => {
    const row = {};
    for (const m of [o.material].flat().filter(Boolean)) {
      if (m.userData && m.userData.celKey !== undefined) {
        row.celKey = m.userData.celKey;
      }
    }
    if (o.userData.fillMat) {
      row.fillMat = `material ${table(o.userData.fillMat, 'm')[0]}`;
    }
    if (o.raycast !== o.constructor.prototype.raycast) {
      row.raycast = 'replaced';
    }
    if (Object.keys(row).length) {
      out.push([paths.get(o), row]);
    }
  });
  return out;
}

function describeBuilt(made) {
  const table = makeTable();
  const graph = scrub(describeObject(made.group, table));
  return { graph, handles: handles(made, table), extras: extras(made, table) };
}

/* The renderer's state, put back after a case. */
function withStage(fn) {
  updateCelTime(0);
  try {
    return fn();
  } finally {
    renderer.setRenderTarget(null);
  }
}

/* The scene drawn and read back as a picture, in sRGB as the screen
 * shows it. */
function shoot(scene, camera, w = 256, h = 160) {
  const target = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x30343c, 1);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  target.dispose();
  const { canvas, ctx } = canvas2d(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  ctx.putImageData(img, 0, 0);
  return picture(canvas);
}

/* Daylight and a ground, the way a valley lights a gate, with a fog far
 * enough out to reach only the pylons. */
function litScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x404830, 0.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  scene.fog = new THREE.Fog(0x9fb0c8, 40, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x557a3a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  return scene;
}

/* A camera that sees layer 1, where every lit part of a gate lives. */
function cameraAt(pos, look, far = 400) {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, far);
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.layers.enable(1);
  return camera;
}

/* The shape src/builder/buildmode.js dressable() makes of a built gate. */
function dressable(made, apertureIndex = 0, extra = {}) {
  return {
    ringMat: made.ringMat,
    haloMat: made.haloMat,
    glowMat: made.glowMat,
    ringMeshes: made.ringMeshes,
    haloMeshes: made.haloMeshes,
    litApertures: [apertureIndex],
    ringColor: made.ringColor,
    glowMesh: made.glowMesh,
    glowGain: 1,
    cueGroup: made.cueGroup,
    fillMat: made.fillMat,
    aperture: made.apertures[apertureIndex] ?? made.apertures[0],
    trackGlow: made.apertures.length > 1,
    virtual: false,
    ...extra,
  };
}

/* Everything dressGate, lightTarget and colourTargetSide write. */
function dressState(gt) {
  const hex = (c) => c.getHexString();
  const u = (m) => (m && m.uniforms ? Object.fromEntries(Object.keys(m.uniforms).sort().map((k) => {
    const v = m.uniforms[k].value;
    return [k, v && v.isColor ? hex(v) : rounded(v)];
  })) : null);
  return {
    ring: { visible: gt.ringMat.visible, color: hex(gt.ringMat.color) },
    halo: { visible: gt.haloMat.visible, color: hex(gt.haloMat.color), opacity: rounded(gt.haloMat.opacity) },
    glow: { visible: gt.glowMat.visible, uniforms: u(gt.glowMat), y: gt.glowMesh ? rounded(gt.glowMesh.position.y) : null },
    ringMeshes: gt.ringMeshes ? gt.ringMeshes.map((m) => m.visible) : null,
    haloMeshes: gt.haloMeshes ? gt.haloMeshes.map((m) => m.visible) : null,
    cue: gt.cueGroup ? { visible: gt.cueGroup.visible, y: rounded(gt.cueGroup.position.y) } : null,
    fill: u(gt.fillMat),
  };
}

/* One gate stood in the lit scene, dressed by `dress`, from `pos`. */
function gateShot(name, dress, pos, look, w, h) {
  return withStage(() => {
    const made = build(name);
    const scene = litScene();
    scene.add(made.group);
    dress(made);
    const shot = shoot(scene, cameraAt(pos, look), w, h);
    disposeStandaloneGate(made);
    return shot;
  });
}

/* Time held still for the hoop's pulse, which reads the page clock. */
function atClock(ms, fn) {
  const real = performance.now;
  performance.now = () => ms;
  try {
    return fn();
  } finally {
    performance.now = real;
  }
}

/* Calls fn with every dispose of the kinds below recorded by the
 * table's ref, and puts the real ones back. */
function recordingDisposals(table, fn) {
  const freed = [];
  const kinds = [THREE.Material, THREE.BufferGeometry, THREE.Texture];
  const reals = kinds.map((K) => K.prototype.dispose);
  kinds.forEach((K, i) => {
    K.prototype.dispose = function dispose() {
      const prefix = this.isMaterial ? 'm' : (this.isTexture ? 't' : 'g');
      freed.push(table(this, prefix)[0]);
      return reals[i].call(this);
    };
  });
  try {
    fn();
  } finally {
    kinds.forEach((K, i) => { K.prototype.dispose = reals[i]; });
  }
  return freed.sort();
}

/* Every material and texture a graph holds, in traversal order, unique. */
function materialsOf(root) {
  const set = new Set();
  root.traverse((o) => [o.material].flat().filter(Boolean).forEach((m) => set.add(m)));
  return [...set];
}

export function cases(stage) {
  ({ renderer } = stage);
  const out = {
    exports: () => ({
      scene: Object.keys(sceneModule).sort(),
      pylons: Object.keys(pylonsModule).sort(),
      GATE_COLOUR,
      START_COLOUR,
      PYLON_SEGMENTS: pylonsModule.PYLON_SEGMENTS,
    }),
    noSpec: () => {
      try {
        standaloneGate(null, 0, false);
        return 'did not throw';
      } catch (e) {
        return e.message;
      }
    },
    /* Which materials gates share: every gate's materials as refs in one
     * table, so a ref seen twice is one material across gates. */
    sharing: () => {
      const table = makeTable();
      const rows = {};
      for (const name of ['gate', 'gateStart', 'ladder', 'flaggedBoth', 'wideGate5', 'pylonPair', 'pylonLeft', 'hoop6']) {
        const made = build(name);
        rows[name] = materialsOf(made.group).map((m) => table(m, 'm')[0]);
        disposeStandaloneGate(made);
      }
      return rows;
    },
    /* What disposeStandaloneGate frees, by ref in the gate's own
     * description, for a framed gate built twice (the second shares the
     * first's kit) and for each pylons kind. */
    dispose: () => {
      const rows = {};
      for (const name of ['flaggedBoth', 'ladder', 'pylonPair', 'pylonLeft', 'hoop6']) {
        const made = build(name);
        const table = makeTable();
        describeObject(made.group, table);
        rows[name] = recordingDisposals(table, () => disposeStandaloneGate(made));
      }
      return rows;
    },
    markers: () => {
      const rows = {};
      const variants = {
        single: [[0], 1.7526, 1.7526, 1, false, undefined],
        start: [[0.3], 2, 1.5, 1, true, null],
        stackDefault: [[0, 1.8, 3.6], 1.7526, 1.7526, 3, false, undefined],
        stackNamed: [[0, 1.8, 3.6], 1.7526, 1.7526, 3, false, 2],
        stackClamped: [[0, 1.8], 1.7526, 1.7526, 2, false, 9],
        wide: [[0], 4, 1, 1, false, 0],
      };
      for (const [name, args] of Object.entries(variants)) {
        const group = new THREE.Group();
        const marks = apertureMarkers(group, ...args);
        const table = makeTable();
        const graph = scrub(describeObject(group, table));
        rows[name] = { graph, handles: handles({ group, ...marks }, table) };
      }
      return rows;
    },
    cues: () => {
      const rows = {};
      for (const [name, args] of Object.entries({ square: [1.7526, 1.7526], tall: [1, 2], round: [6, 6, true], roundFalse: [2, 1, false] })) {
        const cue = gateCue(...args);
        const table = makeTable();
        rows[name] = { graph: scrub(describeObject(cue, table)), fillMat: `material ${table(cue.userData.fillMat, 'm')[0]}` };
      }
      return rows;
    },
    badges: () => {
      const rows = {};
      for (const [name, args] of Object.entries({ zero: [0], seven: [7], thirteen: [13], wide: [108], scaled: [4, 0.4], big: [21, 3], fractional: [6.6], negative: [-2] })) {
        rows[name] = scrub(describeObject(openingBadge(...args)));
      }
      return rows;
    },
    sky: () => {
      const sky = skyDome();
      const graph = scrub(describeObject(sky));
      /* It follows the camera, every draw. */
      const camera = cameraAt([120, 35, -900], [0, 0, 0], 4000);
      camera.updateMatrixWorld();
      sky.onBeforeRender(renderer, new THREE.Scene(), camera);
      return { graph, followed: rounded(sky.position.toArray()), world: rounded(sky.matrixWorld.elements) };
    },
    dress: () => {
      const rows = {};
      const tiers = ['target', 'follow', 'dark'];
      for (const name of ['gate', 'ladder', 'pylonLeft', 'hoop6']) {
        for (const tier of tiers) {
          for (const [variant, extra] of Object.entries({
            plain: {},
            virtual: { virtual: true, glowGain: 0.5 },
            otherLevel: { litApertures: [2] },
            noGain: { glowGain: undefined },
          })) {
            const made = build(name);
            const gt = dressable(made, 0, extra);
            dressGate(gt, tier);
            rows[`${name} ${tier} ${variant}`] = dressState(gt);
            disposeStandaloneGate(made);
          }
        }
      }
      /* The field's shape, which carries no meshes per opening. */
      const made = build('gate');
      const gt = dressable(made, 0, { ringMeshes: undefined, haloMeshes: undefined });
      dressGate(gt, 'follow');
      rows.noMeshes = dressState(gt);
      disposeStandaloneGate(made);
      return rows;
    },
    light: () => {
      const rows = {};
      for (const [name, ap, extra] of [
        ['gate', 0, {}],
        ['ladder', 2, {}],
        ['ladder', 0, { trackGlow: false }],
        ['ladder', 1, { glowGain: 2 }],
        ['pylonLeft', 0, {}],
        ['hoop6', 0, {}],
      ]) {
        const made = build(name);
        const gt = dressable(made, ap, extra);
        dressGate(gt, 'dark');
        lightTarget(gt);
        const lit = dressState(gt);
        colourTargetSide(gt, false);
        const wrong = dressState(gt);
        colourTargetSide(gt, true);
        const right = dressState(gt);
        rows[`${name} ${ap} ${Object.keys(extra).join(',')}`] = { lit, wrong, right };
        disposeStandaloneGate(made);
      }
      return rows;
    },
    hoopGround: () => {
      const rows = {};
      const made = build('hoop6');
      const paths = pathsOf(made.group);
      let drop = null;
      let foot = null;
      made.group.traverse((o) => {
        if (o.type === 'Line') {
          drop = o;
        }
        if (o.geometry && o.geometry.type === 'RingGeometry') {
          foot = o;
        }
      });
      const scene = new THREE.Scene();
      scene.add(made.group);
      const poses = {
        high: [[3, 20, -4], [0, 0.4, 0], (x, z) => 0.1 * x - 0.05 * z],
        low: [[0, 0.1, 0], [0, 0, 0], () => 0],
        tilted: [[-2, 9, 5], [0.7, -1.1, 0.4], (x, z) => Math.sin(x) + z * 0.2],
      };
      for (const [name, [p, r, heightAt]] of Object.entries(poses)) {
        made.group.position.set(...p);
        made.group.rotation.set(...r);
        made.setGround(heightAt);
        rows[name] = {
          drop: { path: paths.get(drop), visible: drop.visible, points: rounded([...drop.geometry.attributes.position.array]) },
          foot: { path: paths.get(foot), visible: foot.visible, p: rounded(foot.position.toArray()), q: rounded(foot.quaternion.toArray()) },
        };
      }
      disposeStandaloneGate(made);
      return rows;
    },

    /* Pictures. A standard gate seen square on from 5 m, its number and
     * prints filling the frame. */
    picGateDark: () => gateShot('gate', (m) => dressGate(dressable(m), 'dark'), [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picGateFollow: () => gateShot('gate', (m) => dressGate(dressable(m, 0, { virtual: true }), 'follow'), [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picGateTarget: () => gateShot('gate', (m) => dressGate(dressable(m), 'target'), [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picGateStartTarget: () => gateShot('gateStart', (m) => dressGate(dressable(m), 'target'), [-1.2, 1.1, 5.5], [0, 1.2, 0]),
    /* lightTarget alone colours the glow by the face it is seen from. */
    picLitFront: () => gateShot('gate', (m) => lightTarget(dressable(m)), [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picLitBack: () => gateShot('gate', (m) => lightTarget(dressable(m)), [-0.6, 1.0, -4.6], [0, 1.2, 0]),
    picRightSide: () => gateShot('gate', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, true);
    }, [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picWrongSide: () => gateShot('gate', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, false);
    }, [0.4, 1.4, 4.6], [0, 1.2, 0]),
    picWrongSideBack: () => gateShot('gate', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, false);
    }, [0.3, 1.2, -3.2], [0, 0.9, 0]),
    /* From 40 m the glow is what reads. */
    picLitFar: () => gateShot('gate', (m) => lightTarget(dressable(m)), [3, 2.5, 40], [0, 1, 0]),
    picLadderTop: () => gateShot('ladder', (m) => {
      const gt = dressable(m, 2);
      lightTarget(gt);
      colourTargetSide(gt, true);
    }, [1.5, 3.5, 9], [0, 3, 0]),
    picDiveGate: () => gateShot('diveGate', (m) => lightTarget(dressable(m)), [2, 3, 11], [0, 5, 0]),
    picWideGate: () => gateShot('wideGate5', (m) => dressGate(dressable(m), 'follow'), [1, 2.5, 10], [0, 2.6, 0]),
    /* Pennants on both ends of a header, waving, at two clock times. */
    picFlags0: () => gateShot('flaggedBoth', (m) => {
      dressGate(dressable(m), 'dark');
      updateCelTime(0);
    }, [0.8, 2.6, 5], [0, 2.7, 0]),
    picFlags1: () => gateShot('flaggedBoth', (m) => {
      dressGate(dressable(m), 'dark');
      updateCelTime(1.37);
    }, [0.8, 2.6, 5], [0, 2.7, 0]),
    picFlagsBehind: () => gateShot('flaggedTop', (m) => {
      dressGate(dressable(m), 'dark');
      updateCelTime(0.6);
    }, [-1.3, 2.4, -4.5], [0, 2.7, 0]),
    picBadge: () => withStage(() => {
      const scene = litScene();
      const badge = openingBadge(48, 1.3);
      badge.position.set(0, 1, 0);
      scene.add(badge);
      return shoot(scene, cameraAt([0.1, 1.05, 0.9], [0, 1, 0]), 160, 100);
    }),
    picPylonPair: () => gateShot('pylonPair', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, true);
    }, [10, 14, 95], [0, 12, 0]),
    picPylon: () => gateShot('pylonLeft', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, false);
    }, [30, 30, 40], [-5, 8, 0]),
    picPylonFollow: () => gateShot('pylonRight', (m) => dressGate(dressable(m), 'follow'), [-25, 20, 45], [5, 8, 0]),
    picHoopLit: () => atClock(1000, () => gateShot('hoop6', (m) => lightTarget(dressable(m)), [1, 4, 14], [0, 3.5, 0])),
    picHoopPulse: () => atClock(1200, () => gateShot('hoop6', (m) => lightTarget(dressable(m)), [1, 4, 14], [0, 3.5, 0])),
    picHoopWrong: () => atClock(500, () => gateShot('hoop6', (m) => {
      const gt = dressable(m);
      lightTarget(gt);
      colourTargetSide(gt, false);
    }, [-1, 3, -12], [0, 3.5, 0])),
    picHoopFar: () => atClock(0, () => withStage(() => {
      const made = build('hoop30');
      const scene = litScene();
      made.group.position.set(0, 25, 0);
      scene.add(made.group);
      made.setGround(() => 0);
      dressGate(dressable(made), 'follow');
      const shot = shoot(scene, cameraAt([60, 30, 250], [0, 30, 0], 2000));
      disposeStandaloneGate(made);
      return shot;
    })),
    picSkySun: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      return shoot(scene, cameraAt([0, 2, 0], [0.6, 2.5, 0.62], 4000));
    }),
    /* The sun's edge off centre, where the disc's ramp is. */
    picSkySunEdge: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      const camera = new THREE.PerspectiveCamera(6, 1.6, 0.05, 4000);
      camera.position.set(0, 2, 0);
      camera.lookAt(0.61, 2.5, 0.6);
      return shoot(scene, camera);
    }),
    picSkyAway: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      return shoot(scene, cameraAt([500, 300, -800], [500 - 0.6, 300 + 0.25, -800 - 0.62], 4000));
    }),
    picSkyZenith: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      const camera = new THREE.PerspectiveCamera(100, 1.6, 0.05, 4000);
      camera.position.set(0, 2, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 3, 0);
      return shoot(scene, camera);
    }),
    /* The sky behind a gate it must never cover. */
    picSkyBehindGate: () => withStage(() => {
      const scene = litScene();
      scene.fog = null;
      scene.add(skyDome());
      const made = build('gate');
      scene.add(made.group);
      dressGate(dressable(made), 'dark');
      const shot = shoot(scene, cameraAt([0.4, 0.4, 4.6], [0.3, 1.6, 0], 4000));
      disposeStandaloneGate(made);
      return shot;
    }),
  };
  /* Every gate's graph, handles and buckets. A ladder lit at a named
   * level is the default ladder but for where its glow and cue sit, so
   * those cases pin that and the handles. */
  for (const name of Object.keys(GATES)) {
    if (name.startsWith('ladder') && name !== 'ladder') {
      out[`primary ${name}`] = () => {
        const made = build(name);
        const table = makeTable();
        describeObject(made.group, table);
        const d = {
          handles: handles(made, table),
          glowY: rounded(made.glowMesh.position.y),
          cueY: rounded(made.cueGroup.position.y),
        };
        disposeStandaloneGate(made);
        return d;
      };
      continue;
    }
    out[`gate ${name}`] = () => {
      const made = build(name);
      const d = describeBuilt(made);
      disposeStandaloneGate(made);
      return d;
    };
  }
  return out;
}
